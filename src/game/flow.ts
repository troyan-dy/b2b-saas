import { CARD_ART } from '../content/cards';
import { CREDITS } from '../content/credits';
import { clock, ENDING_TITLE, endingPost, endingScore, endingStats } from '../content/endings';
import { AGAIN_SAYS } from '../content/texts';
import { money, rate } from '../ui/format';
import type { Card, Terminal } from '../ui/terminal/terminal';
import { finish, LESSONS, raise, saveMeta, traitChoices, traitGives, TRAITS, unlockedNow, type Meta, type Trait } from '../systems/meta/meta';
import { dealIdea, pitch, TUNING, type Idea, type Run } from '../systems/run/run';

/** What the player does outside a run: the menu, the idea, the ending, the résumé. All of it in the terminal. */

export interface MenuState {
  readonly sound: boolean;
  readonly music: boolean;
  /** the name of the background loop */
  readonly track: string;
}

export type MenuChoice = 'start' | 'sound' | 'music' | 'track';

export async function menu(term: Terminal, meta: Meta, state: MenuState, version: string): Promise<MenuChoice> {
  for (;;) {
    term.clear();
    term.print('B2B SaaS', 'big');
    term.print('Собери стартап на ИИ своими руками. Команда — Клод. Деньги — твои.', 'dim');
    term.print('');
    if (meta.runs.length > 0) {
      const last = meta.runs[meta.runs.length - 1];
      term.print(`прошлый стартап: ${last.pitch} — ${ENDING_TITLE[last.ending].toLowerCase()}`, 'dim small');
    }
    const options = [
      { title: meta.runs.length > 0 ? 'Новый стартап' : 'Основать стартап', note: meta.lessons.length > 0 ? `тот же основатель, уроков: ${meta.lessons.length}` : `одна попытка — ${Math.round((TUNING.last_sprint * TUNING.sprint_s) / 60)} минут` },
      { title: 'Резюме основателя', note: meta.runs.length > 0 ? `стартапов: ${meta.runs.length}` : 'пока пустое' },
      { title: `Звук: ${state.sound ? 'включён' : 'выключен'}` },
      { title: `Музыка: ${state.music ? 'включена' : 'выключена'}` },
      { title: `Трек: ${state.track}`, note: 'Enter — следующий' },
      { title: 'Титры' },
    ];
    const k = await term.ask(options, `версия ${version}`);
    if (k === 0) return 'start';
    if (k === 1) await resume(term, meta);
    if (k === 2) return 'sound';
    if (k === 3) return 'music';
    if (k === 4) return 'track';
    if (k === 5) {
      term.clear();
      term.print('Титры', 'mid');
      for (const line of CREDITS) term.print(line, 'small');
      await term.wait('назад');
    }
  }
}

/** The founder's résumé: what was built before and what it taught. */
export async function resume(term: Terminal, meta: Meta): Promise<void> {
  term.clear();
  term.print('Резюме основателя', 'mid');
  if (meta.runs.length === 0) {
    term.print('Опыт: нет. Амбиции: есть.', 'dim');
  } else {
    term.print(`серийный предприниматель · стартапов: ${meta.runs.length}`, 'dim');
    term.print('');
    for (const r of meta.runs.slice(-7)) {
      const how = r.ending === 'sold' ? `продан за <em>${money(r.soldFor)}</em>` : r.ending === 'profit' ? '<em>вышел на прибыль</em>' : r.ending === 'late' ? 'время вышло' : '<strong>банкротство</strong>';
      term.print(`${r.pitch} — ${how}, ${clock(r.lived)}${r.value ? ` · оценка ${money(r.value)}` : ''}`, 'small');
    }
  }
  // the traits: what grows with every startup
  const grown = TRAITS.filter((t) => (meta.traits[t.id] ?? 0) > 0);
  if (grown.length > 0) {
    term.print('');
    term.print('черты основателя:', 'dim');
    for (const t of grown) {
      const level = meta.traits[t.id] ?? 0;
      term.print(`<b>${t.title}</b> ${'■'.repeat(level)}${'□'.repeat(t.max - level)} — ${traitGives(t, level)}`, 'small');
    }
  }
  term.print('');
  if (meta.lessons.length > 0) {
    term.print('чему научился:', 'dim');
    for (const id of meta.lessons) {
      const l = LESSONS.find((x) => x.id === id);
      if (l) term.print(`<b>${l.title}</b> — ${l.gives}`, 'small');
    }
  } else term.print('уроков пока нет: их даёт только законченный стартап', 'dim small');
  await term.wait('назад');
}

/** what a card does, one fact a line: «чек ×1,5, но и токенов уходит ×1,5» → two lines */
function facts(does: string): string[] {
  return does === '' ? [] : does.split(', ').map((x) => x.replace(/^но и /, ''));
}

function traitCard(t: Trait, level: number, kicker: string, to: number): Card {
  return { kicker, title: t.title, note: t.note, art: t.art, facts: [`${traitGives(t, to)}`, level > 0 ? `сейчас: ${traitGives(t, level)}` : 'сейчас этой черты нет'] };
}

/**
 * Three decks, three cards dealt from each: the idea is mixed by hand. A founder with traits then
 * picks one to lean on twice as hard in this startup.
 */
export async function mixIdea(term: Terminal, seed: number, meta: Meta): Promise<{ idea: Idea; boost: string }> {
  const deal = dealIdea(seed, meta.runs.length);
  term.clear();
  await term.type(['❯ Опишите стартап в трёх словах. Слово первое: какой у нас ИИ?'], '');
  const tech = deal.tech[await term.cards(deal.tech.map((c) => ({ kicker: 'какой ИИ', title: `${c.adj} ИИ`, note: c.note, art: CARD_ART[c.id], facts: facts(c.does) })))];

  term.clear();
  term.print(`${tech.adj} ИИ-…`, 'mid');
  await term.type(['Слово второе: на что это похоже?'], '');
  const form = deal.form[await term.cards(deal.form.map((c) => ({ kicker: 'на что похоже', title: `ИИ-${c.name}`, note: c.note, art: CARD_ART[c.id], facts: facts(c.does) })))];

  term.clear();
  term.print(`${tech.adj} ИИ-${form.name} для…`, 'mid');
  await term.type(['Слово третье: кому это продаём?'], '');
  const aud =
    deal.aud[
      await term.cards(
        deal.aud.map((c) => ({ kicker: 'кому продаём', title: `для ${c.name}`, note: c.note, art: c.texture, facts: [`клиент платит от ${rate(c.pay / TUNING.sprint_s)} в секунду`, ...facts(c.does)] })),
      )
    ];

  // the founder's traits: one of them counts twice in this startup
  let boost = '';
  const grown = TRAITS.filter((t) => (meta.traits[t.id] ?? 0) > 0);
  // one trait is no choice: it is the bet by itself
  if (grown.length === 1) boost = grown[0].id;
  if (grown.length > 1) {
    term.clear();
    term.print(`${tech.adj} ИИ-${form.name} для ${aud.name}`, 'mid');
    await term.type(['На что сделаем ставку? Эта черта в этом стартапе сработает вдвое.'], '');
    const three = grown.slice(0, 3);
    boost = three[await term.cards(three.map((t) => traitCard(t, meta.traits[t.id] ?? 0, 'ставка стартапа · ×2', (meta.traits[t.id] ?? 0) * 2)))].id;
  }

  const idea: Idea = { tech, form, aud };
  term.clear();
  term.print(pitch(idea), 'mid');
  const minutes = Math.round((TUNING.start_money / (TUNING.living_per_s + TUNING.tiers.fast.cost_per_s) / 60) * 10) / 10;
  const lines = [
    '<b>❯ Клод</b>',
    'Звучит как стартап. Инвесторов у нас нет — есть твои сбережения.',
    `Их хватит минут на ${String(minutes).replace('.', ',')}, если ничего не продадим.`,
    `Цель: выйти в плюс за ${TUNING.last_sprint} спринтов. Или хотя бы красиво закрыться.`,
  ];
  const last = meta.runs[meta.runs.length - 1];
  // the same founder, a new session of Claude: the past is told to him, not remembered
  if (last) lines.splice(1, 0, AGAIN_SAYS[last.ending] ?? AGAIN_SAYS.broke);
  if (meta.runs.length >= 3) lines.push(`Это твой ${meta.runs.length + 1}-й стартап. В резюме это называется «опыт».`);
  if (meta.lessons.length > 0) lines.push(`С тобой твой опыт: уроков — ${meta.lessons.length}.`);
  const bet = TRAITS.find((t) => t.id === boost);
  if (bet) lines.push(`Ставка этого стартапа — <em>${bet.title.toLowerCase()}</em>: ${traitGives(bet, (meta.traits[bet.id] ?? 0) * 2)}.`);
  await term.type(lines, '');
  if (meta.runs.length === 0) {
    // the first startup: how the sheet works, in four lines — the rest is taught on the sheet itself
    term.print('');
    term.print('как это устроено:', 'dim small');
    term.print('1. Справа — блоки. Выбери блок, потом клетку на чертеже.', 'small');
    term.print('2. Я строю. Клик по стройке или Enter — помочь руками.', 'small');
    term.print(`3. Каждые ${TUNING.sprint_s} секунды релиз: достроенное начинает работать.`, 'small');
    term.print('4. Клиенты придут после ядра и лендинга. Платить начнут после «Приёма оплаты».', 'small');
    term.print('5. Ты один и проверяешь одно направление: там работа идёт быстрее и чище.', 'small');
    term.print('Что делать дальше, всегда написано под счётчиком денег.', 'dim small');
  }
  await term.wait('начать');
  return { idea, boost };
}

/** The end of a startup: the founder's post, the numbers, what was learned. Returns when the player wants the next one. */
export async function ending(term: Terminal, run: Run, meta: Meta, persist = true): Promise<void> {
  const got = finish(run, meta);
  if (persist) saveMeta(meta);
  term.open(`конец · ${ENDING_TITLE[run.over ?? 'broke'].toLowerCase()}`);
  let learned = false;
  for (;;) {
    term.clear();
    // the result first: one big number and one line of figures — nothing to read before it
    const [score, caption] = endingScore(run);
    term.print(`${ENDING_TITLE[run.over ?? 'broke']} · ${pitch(run.idea)}`, 'dim');
    term.print(score, 'big');
    term.print(caption, 'dim small');
    term.print(endingStats(run), 'small');
    term.print('');
    // then what the founder takes into the next startup
    for (const l of got) term.print(`урок: <b>${l.title}</b> — <em>${l.gives}</em>`, 'small');
    if (got.length === 0) term.print('новых уроков нет: всё это ты уже проходил', 'dim small');
    term.print('');
    // and the post itself, for those who read posts
    term.print('пост основателя', 'dim small');
    for (const line of endingPost(run)) term.print(line, 'dim small');
    if (!learned) {
      // every startup, whatever its end, makes the founder better at one thing: a card out of three
      learned = true;
      const choices = traitChoices(meta, run.seed);
      if (choices.length > 0) {
        await term.wait('дальше: чему ты научился');
        term.clear();
        term.print('Чему ты научился в этом стартапе?', 'mid');
        term.print('черта остаётся с тобой во всех следующих стартапах', 'dim small');
        const pick = choices[await term.cards(choices.map((t) => traitCard(t, meta.traits[t.id] ?? 0, `черта основателя · уровень ${(meta.traits[t.id] ?? 0) + 1} из ${t.max}`, (meta.traits[t.id] ?? 0) + 1)))];
        raise(meta, pick.id);
        if (persist) saveMeta(meta);
        term.clear();
        term.print(`${pick.title}: уровень ${meta.traits[pick.id]}`, 'mid');
        term.print(traitGives(pick, meta.traits[pick.id] ?? 0), 'small');
        // what the next startup will see for the first time
        const fresh = unlockedNow(meta.runs.length);
        if (fresh.length > 0) {
          term.print('');
          term.print('новое в следующем стартапе:', 'dim small');
          for (const name of fresh) term.print(`карта идеи <b>«${name}»</b>`, 'small');
        }
      }
    }
    const k = await term.ask([{ title: 'Новый стартап', note: 'тот же основатель, новая идея' }, { title: 'Резюме основателя' }]);
    if (k === 0) return;
    await resume(term, meta);
  }
}
