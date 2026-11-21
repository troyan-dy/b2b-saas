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
import './game/pitch.css';
import { readArgs } from './core/args';
import { L, LANG } from './core/lang';
import { installMetrics } from './core/metrics';
import { startMusic } from './core/music';
import { afterGameTime } from './core/pause-clock';
import { installPause } from './ui/pause';
import { createRng } from './core/rng';
import { loadSettings, saveSettings, type Settings } from './core/settings';
import { playSound, unlockSound } from './core/sound';
import { ending, menu, mixIdea } from './game/flow';
import { packSale } from './game/sale';
import { GameScene } from './game/GameScene';
import { startGuide } from './game/startup-guide';
import { playBot, SENSIBLE } from './gyms/bot';
import { mountGymKeys } from './gyms/keys';
import { LookdevScene } from './gyms/lookdev/LookdevScene';
import { mountMusicDemo } from './gyms/music/MusicDemo';
import { SheetScene } from './gyms/sheet/SheetScene';
import { bestValuation, emptyMeta, loadMeta, recordResult, restoreResult, traitLevels, type FinalRun } from './systems/meta/meta';
import { ACTIVE_TECHS, createRun, IDEAS, type Idea, type Run } from './systems/run/run';
import { completeCompanyResult, finishCompany, recoverCompanyResult } from './systems/run/result-storage';
import { loadRun, saveRun } from './systems/run/save';
import { createHud } from './ui/hud';
import { createPaper } from './ui/paper';
import { mountUiScale } from './ui/scale';
import { createTerminal } from './ui/terminal/terminal';
import { HelloScene } from './view/HelloScene';

const args = readArgs(window.location.search);
// the page speaks the language of the game: index.html is written in English
document.documentElement.lang = LANG;
document
  .querySelector('meta[name="description"]')
  ?.setAttribute('content', L('B2B SaaS — тайкун про то, как в одиночку собрать свой стартап на ИИ', 'B2B SaaS — a tycoon about building your own AI startup single-handedly'));
installMetrics();

const settings = loadSettings();
const pause = installPause(settings);
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
  document.fonts.load('700 32px "JetBrains Mono"', L('Клод $0', 'Claude $0')),
  document.fonts.load('400 24px "JetBrains Mono"', L('Клод $0', 'Claude $0')),
  document.fonts.load('600 64px "Source Serif 4"', L('Блок $0', 'Block $0')),
  document.fonts.load('400 24px "Source Serif 4"', L('Блок $0', 'Block $0')),
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

/** The other language: the choice is kept and the page starts over in it, on the menu again. */
function switchLanguage(settings: Settings): void {
  settings.lang = LANG === 'en' ? 'ru' : 'en';
  saveSettings(settings);
  // an address that asks for a language would overrule the menu
  const url = new URL(window.location.href);
  url.searchParams.delete('lang');
  if (url.href === window.location.href) window.location.reload();
  else window.location.replace(url.href);
}

/** The whole game: the terminal with the menu and the idea, the run on the sheet, the ending in the terminal. */
async function play(): Promise<void> {
  startMusic();
  for (const event of ['pointerdown', 'pointerup', 'keydown', 'click']) {
    window.addEventListener(event, startMusic, { capture: true, passive: true });
  }
  const meta = loadMeta();
  const persistent = !(__TOOLS__ && (args.gym !== '' || args.bot || args.capture));
  const saved = persistent ? loadRun() : null;
  if (!persistent) delete meta.pending; // Practice runs keep their own ending in memory.
  let selected: Run | null = null;
  let restored = false;
  const paper = createPaper(under, over);
  paper.show(false);
  const term = createTerminal(over, (name) => {
    unlockSound();
    playSound(name);
  });

  term.open(L('терминал основателя', 'the founder’s terminal'));
  const showResult = async (result: FinalRun): Promise<void> => {
    await ending(term, result, meta, persistent);
    while (!completeCompanyResult(result, meta, persistent)) {
      term.clear();
      term.print(L('Не удалось сохранить результат компании.', 'Could not save the company result.'), 'mid');
      const choice = await term.ask([
        { title: L('Повторить сохранение', 'Retry saving') },
        { title: L('Загрузить последнее сохранение', 'Reload last save'),
          note: L('Несохранённые изменения будут потеряны.', 'Unsaved changes will be lost.') },
      ]);
      if (choice === 1) { reload(false); return; }
    }
    reload(true);
  };
  const recovered = persistent ? recoverCompanyResult(meta, saved) : null;
  if (recovered) {
    await showResult(recovered);
    return;
  }
  if (!takeAgain() || args.menu || saved) {
    for (;;) {
      const choice = await menu(term, meta, __VERSION__, saved);
      if (choice === 'continue') {
        if (!saved) continue;
        selected = saved;
        restored = true;
        break;
      }
      if (choice === 'start') break;
      if (choice === 'lang') {
        switchLanguage(settings);
        // the page is leaving: nothing more is asked on this one
        return;
      }
      await pause.open();
    }
  }
  if (!selected) {
    const cancel = document.createElement('button');
    cancel.className = 'pitch-cancel';
    cancel.textContent = L('Вернуться в меню', 'Back to menu');
    cancel.onclick = () => reload(false);
    over.append(cancel);
    const draft = await mixIdea(term, args.seed, meta, !!saved);
    cancel.remove();
    if (!draft) { reload(false); return; }
    const { idea, boost } = draft;
    selected = createRun(args.seed, idea, meta.lessons, traitLevels(meta, boost));
    if (persistent && !saved && meta.runs.length === 0) startGuide(selected);
  }
  const run = selected;
  const persist = (): void => {
    if (!persistent) return;
    if (run.over) finishCompany(run, meta, true);
    else saveRun(run);
  };
  persist();
  const autosave = persistent ? window.setInterval(persist, 2000) : undefined;
  if (persistent) window.addEventListener('pagehide', persist);
  const stopSaving = (): void => {
    if (autosave !== undefined) window.clearInterval(autosave);
    window.removeEventListener('pagehide', persist);
  };
  let finished = false;
  const scene = new GameScene(run, rng, paper, {
    onHidden: () => void pause.open(),
    terminalShown: () => term.shown,
    restored,
    bestValuation: bestValuation(meta.runs),
    // the bot is a tool of the gyms and captures: the release has no code path to it
    beforeStep: __TOOLS__ && args.bot ? (r) => playBot(r) : undefined,
    onEnd: (r: Run) => {
      if (finished) return;
      finished = true;
      pause.setQuit(null);
      stopSaving();
      const result = finishCompany(r, meta, persistent);
      // the last frame of the startup stays on the sheet for a moment, then the terminal takes over
      if (r.over === 'sold') void packSale(over, r).then(() => showResult(result));
      else afterGameTime(() => void showResult(result), 1400);
    },
  });
  pause.setQuit(() => {
    persist();
    stopSaving();
    reload(false);
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
  const idea: Idea = { tech: pick(ACTIVE_TECHS, n), form: pick(IDEAS.form, n + 3), aud: pick(IDEAS.aud, n) };
  const run = createRun(args.seed, idea);
  const style = { ...SENSIBLE, calls: !args.flags.includes('nocalls'), fix: !args.flags.includes('nofix') };
  const paper = createPaper(under, over);
  const term = createTerminal(over, (name) => playSound(name));
  const scene = new GameScene(run, rng, paper, {
    onHidden: () => void pause.open(),
    beforeStep: args.bot ? (r) => playBot(r, style) : undefined,
    // the gym shows the ending too, but writes nothing into the founder's record
    onEnd: (r: Run) => {
      const meta = emptyMeta();
      recordResult(r, meta);
      afterGameTime(() => void ending(term, restoreResult(meta)!, meta, false).then(() => window.location.reload()), 1400);
    },

  });
  scene.speed = args.speed;
  pause.setQuit(() => window.location.reload());
  mountGymKeys(scene, run, args.debug);
  window.__GAME__.run = run;
  start(scene);
} else void play();
