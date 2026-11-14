// The licence texts of everything third-party in the build → public/LICENSES.txt. Runs before every build.
import fs from 'node:fs';

const PARTS = [
  ['Phaser', 'phaser', 'LICENSE.md', 'https://github.com/phaserjs/phaser'],
  ['ZzFX', 'zzfx', 'LICENSE', 'https://github.com/KilledByAPixel/ZzFX'],
  ['JetBrains Mono (font)', '@fontsource/jetbrains-mono', 'LICENSE', 'https://github.com/JetBrains/JetBrainsMono'],
  ['Source Serif 4 (font)', '@fontsource/source-serif-4', 'LICENSE', 'https://github.com/adobe-fonts/source-serif'],
];

/** Assets that are not npm packages: one line each, kept in step with .studioigor/ASSETS.md. */
const EXTRA = [];

const game = JSON.parse(fs.readFileSync('package.json', 'utf8'));
let out = `B2B SaaS ${game.version} — third-party licences\n\n`;
for (const line of EXTRA) out += `${line}\n`;
for (const [name, pkg, file, url] of PARTS) {
  const version = JSON.parse(fs.readFileSync(`node_modules/${pkg}/package.json`, 'utf8')).version;
  const text = fs.readFileSync(`node_modules/${pkg}/${file}`, 'utf8').trim();
  out += `\n${'='.repeat(72)}\n${name} ${version} — ${url}\n${'='.repeat(72)}\n\n${text}\n`;
}
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/LICENSES.txt', out);
console.log(`public/LICENSES.txt: ${PARTS.length} licences, ${out.length} characters`);
