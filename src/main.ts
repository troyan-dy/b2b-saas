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
import { createRng } from './core/rng';
import { GameScene } from './game/GameScene';
import { playBot } from './gyms/bot';
import { mountGymKeys } from './gyms/keys';
import { LookdevScene } from './gyms/lookdev/LookdevScene';
import { createRun, IDEAS } from './systems/run/run';
import { createHud } from './ui/hud';
import { createPaper } from './ui/paper';
import { mountUiScale } from './ui/scale';
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

// ?gym=hello — environment check · ?gym=lookdev — the key frame · ?gym=build — a run with a fixed idea, for tuning and captures
function pickScene(): Phaser.Scene {
  if (__TOOLS__ && args.gym === 'hello') return new HelloScene(rng, createHud(over));
  if (__TOOLS__ && args.gym === 'lookdev') return new LookdevScene(rng, createPaper(under, over));
  const idea = { tech: IDEAS.tech[0], form: IDEAS.form[3], aud: IDEAS.aud[0] };
  const run = createRun(args.seed, idea);
  const scene = new GameScene(run, rng, createPaper(under, over), {
    beforeStep: args.bot ? (r) => playBot(r) : undefined,
    onEnd: () => undefined,
  });
  scene.speed = args.speed;
  if (__TOOLS__) mountGymKeys(scene, run, args.debug);
  return scene;
}
// text needs the web fonts before the first frame
await Promise.all([
  document.fonts.load('700 32px "JetBrains Mono"', 'Клод $0'),
  document.fonts.load('400 24px "JetBrains Mono"', 'Клод $0'),
  document.fonts.load('600 64px "Source Serif 4"', 'Блок $0'),
  document.fonts.load('400 24px "Source Serif 4"', 'Блок $0'),
]).catch(() => undefined);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1920,
  height: 1080,
  transparent: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [pickScene()],
});
