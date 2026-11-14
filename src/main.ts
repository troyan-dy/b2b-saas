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
import { LookdevScene } from './gyms/lookdev/LookdevScene';
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

// ?gym=hello — environment check · ?gym=lookdev — the key frame; the game itself arrives with the first mechanics
function pickScene(): Phaser.Scene {
  if (__TOOLS__ && args.gym === 'hello') return new HelloScene(rng, createHud(over));
  return new LookdevScene(rng, createPaper(under, over));
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
