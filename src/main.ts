import Phaser from 'phaser';
import '@fontsource/jetbrains-mono/cyrillic-400.css';
import '@fontsource/jetbrains-mono/cyrillic-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/source-serif-4/cyrillic-400.css';
import '@fontsource/source-serif-4/cyrillic-600.css';
import '@fontsource/source-serif-4/latin-400.css';
import '@fontsource/source-serif-4/latin-600.css';
import './ui/style.css';
import { readArgs } from './core/args';
import { installMetrics } from './core/metrics';
import { nextTrack, setMusicOn, setTrack, startMusic, trackTitle } from './core/music';
import { createRng } from './core/rng';
import { loadSettings, saveSettings } from './core/settings';
import { playSound, setSoundOn, unlockSound } from './core/sound';
import { ending, menu, mixIdea } from './game/flow';
import { GameScene } from './game/GameScene';
import { playBot, SENSIBLE } from './gyms/bot';
import { mountGymKeys } from './gyms/keys';
import { LookdevScene } from './gyms/lookdev/LookdevScene';
import { mountMusicDemo } from './gyms/music/MusicDemo';
import { SheetScene } from './gyms/sheet/SheetScene';
import { emptyMeta, loadMeta, traitLevels } from './systems/meta/meta';
import { createRun, IDEAS, type Idea, type Run } from './systems/run/run';
import { createHud } from './ui/hud';
import { createPaper } from './ui/paper';
import { mountUiScale } from './ui/scale';
import { createTerminal } from './ui/terminal/terminal';
import { HelloScene } from './view/HelloScene';

const args = readArgs(window.location.search);
installMetrics();

const rng = createRng(args.seed);
const stage = document.getElementById('stage')!;
const ui = document.getElementById('ui')!;

// two HTML layers of 1920×1080 px: `under` below the canvas, `over` above it
const under = document.createElement('div');
under.className = 'ui1080';
ui.append(under);
const top = document.createElement('div');
top.id = 'top';
const over = document.createElement('div');
over.className = 'ui1080';
top.append(over);
stage.append(top);
mountUiScale(stage, ui);
mountUiScale(stage, top);

// text needs the web fonts before the first frame
await Promise.all([
  document.fonts.load('700 32px "JetBrains Mono"', 'Клод $0'),
  document.fonts.load('400 24px "JetBrains Mono"', 'Клод $0'),
  document.fonts.load('600 64px "Source Serif 4"', 'Блок $0'),
  document.fonts.load('400 24px "Source Serif 4"', 'Блок $0'),
]).catch(() => undefined);

function start(scene: Phaser.Scene): void {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: 1920,
    height: 1080,
    transparent: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [scene],
  });
}

/** the flag that survives a reload: the next page opens on a new idea, not on the menu */
const AGAIN = 'b2b-saas-again';

function takeAgain(): boolean {
  try {
    const v = sessionStorage.getItem(AGAIN) === '1';
    sessionStorage.removeItem(AGAIN);
    return v;
  } catch {
    return false;
  }
}

function reload(again: boolean): void {
  try {
    if (again) sessionStorage.setItem(AGAIN, '1');
  } catch {
    // no storage: the menu will be shown again
  }
  window.location.reload();
}

/** The whole game: the terminal with the menu and the idea, the run on the sheet, the ending in the terminal. */
async function play(): Promise<void> {
  const settings = loadSettings();
  // one place switches the sound: the menu and the pause card both come here
  const audio = {
    get sound(): boolean {
      return settings.sound;
    },
    get music(): boolean {
      return settings.music;
    },
    get track(): string {
      return trackTitle(settings.track);
    },
    toggle(what: 'sound' | 'music' | 'track'): void {
      if (what === 'track') settings.track = nextTrack(settings.track);
      else settings[what] = !settings[what];
      setSoundOn(settings.sound);
      setTrack(settings.track);
      setMusicOn(settings.music);
      saveSettings(settings);
    },
  };
  setSoundOn(settings.sound);
  setTrack(settings.track);
  setMusicOn(settings.music);
  const meta = loadMeta();
  const paper = createPaper(under, over);
  paper.show(false);
  const term = createTerminal(over, (name) => {
    unlockSound();
    startMusic();
    playSound(name);
  });

  term.open('терминал основателя');
  if (!takeAgain() || args.menu) {
    for (;;) {
      const choice = await menu(term, meta, audio, __VERSION__);
      if (choice === 'start') break;
      audio.toggle(choice);
    }
  }
  const { idea, boost } = await mixIdea(term, args.seed, meta);
  const run = createRun(args.seed, idea, meta.lessons, traitLevels(meta, boost));
  const scene = new GameScene(run, rng, paper, {
    beforeStep: args.bot ? (r) => playBot(r) : undefined,
    onEnd: (r: Run) => {
      // the last frame of the startup stays on the sheet for a moment, then the terminal takes over
      window.setTimeout(() => {
        void ending(term, r, meta).then(() => reload(true));
      }, 1400);
    },
    onQuit: () => reload(false),
    audio,
  });
  scene.speed = args.speed;
  if (__TOOLS__ && args.debug) mountGymKeys(scene, run, true);
  start(scene);
  paper.show(true);
  await term.leave();
}

// ?gym=hello — environment check · ?gym=lookdev — the key frame · ?gym=sheet — every unit of content side by side ·
// ?gym=music — every background loop, to choose by ear · ?gym=build — a run with a fixed idea, straight on the sheet
if (__TOOLS__ && args.gym === 'hello') start(new HelloScene(rng, createHud(over)));
else if (__TOOLS__ && args.gym === 'lookdev') start(new LookdevScene(rng, createPaper(under, over)));
else if (__TOOLS__ && args.gym === 'sheet') start(new SheetScene(args.state, over));
else if (__TOOLS__ && args.gym === 'music') mountMusicDemo(over);
else if (__TOOLS__ && args.gym === 'build') {
  const pick = <T,>(items: readonly T[], k: number): T => items[k % items.length];
  const n = Number(args.state) || 0;
  const idea: Idea = { tech: pick(IDEAS.tech, n), form: pick(IDEAS.form, n + 3), aud: pick(IDEAS.aud, n) };
  const run = createRun(args.seed, idea);
  const style = { ...SENSIBLE, calls: !args.flags.includes('nocalls'), fix: !args.flags.includes('nofix') };
  const paper = createPaper(under, over);
  const term = createTerminal(over, (name) => playSound(name));
  const scene = new GameScene(run, rng, paper, {
    beforeStep: args.bot ? (r) => playBot(r, style) : undefined,
    // the gym shows the ending too, but writes nothing into the founder's record
    onEnd: (r: Run) => {
      window.setTimeout(() => void ending(term, r, emptyMeta(), false).then(() => window.location.reload()), 1400);
    },
    onQuit: () => window.location.reload(),
  });
  scene.speed = args.speed;
  mountGymKeys(scene, run, args.debug);
  window.__GAME__.run = run;
  start(scene);
} else void play();
