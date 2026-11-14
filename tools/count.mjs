// Counts the content of the game for .studioigor/SCOPE.md: `node tools/count.mjs <what>` prints one number.
import { readFileSync } from 'node:fs';

const json = (name) => JSON.parse(readFileSync(new URL(`../src/data/balance/${name}.json`, import.meta.url), 'utf8'));
const text = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const counts = {
  cards: () => {
    const ideas = json('ideas');
    return ideas.tech.length + ideas.form.length + ideas.aud.length;
  },
  blocks: () => Object.keys(json('blocks')).length,
  // a headline of the news line and an event that changes the numbers are both news
  news: () => json('events').length + json('headlines').length,
  clients: () => json('clients').length,
  tiers: () => Object.keys(json('run').tiers).length,
  stages: () => json('run').stages.length,
  // every ending is a post of its own genre: one `case` in the founder's post plus the default one
  endings: () => (text('src/content/endings.ts').match(/^\s+(case '\w+'|default):$/gm) ?? []).length,
  lessons: () => json('lessons').length,
};

const what = process.argv[2];
if (!(what in counts)) {
  console.error(`what to count: ${Object.keys(counts).join(', ')}`);
  process.exit(1);
}
console.log(counts[what]());
