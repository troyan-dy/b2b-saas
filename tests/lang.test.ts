import { expect, test } from 'vitest';
import dilemmasEn from '../src/data/balance/dilemmas.en.json';
import dilemmas from '../src/data/balance/dilemmas.json';
import eventsEn from '../src/data/balance/events.en.json';
import events from '../src/data/balance/events.json';
import headlinesEn from '../src/data/balance/headlines.en.json';
import headlines from '../src/data/balance/headlines.json';
import ideasEn from '../src/data/balance/ideas.en.json';
import ideas from '../src/data/balance/ideas.json';
import lessonsEn from '../src/data/balance/lessons.en.json';
import lessons from '../src/data/balance/lessons.json';
import traitsEn from '../src/data/balance/traits.en.json';
import traits from '../src/data/balance/traits.json';

// A row added in Russian and forgotten in English is shown in Russian to an English player: nothing fails, it just looks broken.
const ids = (rows: { id: string }[]): string[] => rows.map((r) => r.id).sort();

test('every row of the balance files has its English words', () => {
  expect(Object.keys(dilemmasEn).sort()).toEqual(ids(dilemmas));
  expect(Object.keys(eventsEn).sort()).toEqual(ids(events));
  expect(Object.keys(lessonsEn).sort()).toEqual(ids(lessons));
  expect(Object.keys(traitsEn).sort()).toEqual(ids(traits));
  expect(Object.keys(ideasEn.tech).sort()).toEqual(ids(ideas.tech));
  expect(Object.keys(ideasEn.form).sort()).toEqual(ids(ideas.form));
  expect(Object.keys(ideasEn.aud).sort()).toEqual(ids(ideas.aud));
  expect(headlinesEn.length).toBe(headlines.length);
});

test('the English words keep the shape of the Russian ones', () => {
  const words = dilemmasEn as Record<string, { options: { fx?: object[] }[] }>;
  for (const d of dilemmas) {
    expect(words[d.id].options.length, d.id).toBe(d.options.length);
    // an effect that says something (a tag, a parting line) says it in English too
    d.options.forEach((o, k) => {
      o.fx.forEach((f, m) => {
        const said = Object.keys(f).filter((key) => key === 'tag' || key === 'say' || key === 'text');
        expect(Object.keys(words[d.id].options[k].fx?.[m] ?? {}).sort(), `${d.id}/${k}/${m}`).toEqual(said.sort());
      });
    });
  }
  for (const e of events) expect('tag' in (eventsEn as Record<string, object>)[e.id], e.id).toBe(e.tag !== '');
  for (const a of ideas.aud) expect((ideasEn.aud as Record<string, { clients: string[] }>)[a.id].clients.length, a.id).toBe(a.clients.length);
  expect(ideasEn.corp.length).toBe(ideas.corp.length);
  expect(ideasEn.startup.length).toBe(ideas.startup.length);
  expect(ideasEn.gov.length).toBe(ideas.gov.length);
});
