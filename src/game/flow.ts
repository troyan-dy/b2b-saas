import { CREDITS } from '../content/credits';
import { clock, ENDING_TITLE, endingPost, endingStats } from '../content/endings';
import { money } from '../ui/format';
import type { Terminal } from '../ui/terminal/terminal';
import { finish, LESSONS, saveMeta, type Meta } from '../systems/meta/meta';
import { dealIdea, pitch, TUNING, type Idea, type Run } from '../systems/run/run';

/** What the player does outside a run: the menu, the idea, the ending, the résumé. All of it in the terminal. */

export interface MenuState {
  sound: boolean;
  music: boolean;
}

export type MenuChoice = 'start' | 'sound' | 'music';

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
      { title: meta.runs.length > 0 ? 'Новый стартап' : 'Основать стартап', note: meta.lessons.length > 0 ? `тот же основатель, уроков: ${meta.lessons.length}` : 'одна попытка — 20 минут' },
      { title: 'Резюме основателя', note: meta.runs.length > 0 ? `стартапов: ${meta.runs.length}` : 'пока пустое' },
      { title: `Звук: ${state.sound ? 'включён' : 'выключен'}` },
      { title: `Музыка: ${state.music ? 'включена' : 'выключена'}` },
      { title: 'Титры' },
    ];
    const k = await term.ask(options, `версия ${version}`);
    if (k === 0) return 'start';
    if (k === 1) await resume(term, meta);
    if (k === 2) return 'sound';
    if (k === 3) return 'music';
    if (k === 4) {
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
      term.print(`${r.pitch} — ${how}, ${clock(r.lived)}`, 'small');
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

/** Three questions, three cards each: the idea is mixed by hand. */
export async function mixIdea(term: Terminal, seed: number, meta: Meta): Promise<Idea> {
  const deal = dealIdea(seed);
  term.clear();
  await term.type(['❯ Опишите стартап в трёх словах.', 'Слово первое. Какой у нас ИИ?'], '');
  const tech = deal.tech[await term.ask(deal.tech.map((c) => ({ title: `${c.adj} — ${c.note}`, note: c.does })))];

  term.clear();
  term.print(`${tech.adj} ИИ-…`, 'mid');
  await term.type(['Слово второе. На что это похоже?'], '');
  const form = deal.form[await term.ask(deal.form.map((c) => ({ title: `${c.name} — ${c.note}`, note: c.does })))];

  term.clear();
  term.print(`${tech.adj} ИИ-${form.name} для…`, 'mid');
  await term.type(['Слово третье. Кому это продаём?'], '');
  const aud = deal.aud[await term.ask(deal.aud.map((c) => ({ title: `для ${c.name} — ${c.note}`, note: `подписка от $${c.pay} за спринт` })))];

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
  if (meta.lessons.length > 0) lines.push(`С тобой твой опыт: уроков — ${meta.lessons.length}.`);
  await term.type(lines, '');
  await term.wait('начать');
  return idea;
}

/** The end of a startup: the founder's post, the numbers, what was learned. Returns when the player wants the next one. */
export async function ending(term: Terminal, run: Run, meta: Meta): Promise<void> {
  const got = finish(run, meta);
  saveMeta(meta);
  term.open(`конец · ${ENDING_TITLE[run.over ?? 'broke'].toLowerCase()}`);
  for (;;) {
    term.clear();
    term.print(ENDING_TITLE[run.over ?? 'broke'], 'mid');
    term.print('пост основателя', 'dim small');
    await term.type(endingPost(run), '');
    term.print('');
    term.print(endingStats(run), 'dim small');
    for (const l of got) term.print(`урок: <b>${l.title}</b>. ${l.text} <em>${l.gives}</em>`, 'small');
    if (got.length === 0) term.print('новых уроков нет: всё это ты уже проходил', 'dim small');
    const k = await term.ask([{ title: 'Новый стартап', note: 'тот же основатель, новая идея' }, { title: 'Резюме основателя' }]);
    if (k === 0) return;
    await resume(term, meta);
  }
}
