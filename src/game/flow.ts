import { CARD_ART } from '../content/cards';
import { CREDITS } from '../content/credits';
import { clock, ENDING_TITLE, endingPost, endingScore, endingStats } from '../content/endings';
import { AGAIN_SAYS } from '../content/texts';
import { L } from '../core/lang';
import { dec, money, rate } from '../ui/format';
import type { Card, Terminal } from '../ui/terminal/terminal';
import { finish, LESSONS, pastPitch, raise, saveMeta, traitChoices, traitGives, TRAITS, unlockedNow, type Meta, type Trait } from '../systems/meta/meta';
import { dealIdea, pitch, TUNING, type Idea, type Run } from '../systems/run/run';

/** What the player does outside a run: the menu, the idea, the ending, the résumé. All of it in the terminal. */

export interface MenuState {
  readonly sound: boolean;
  readonly music: boolean;
  /** the name of the background loop */
  readonly track: string;
}

export type MenuChoice = 'start' | 'continue' | 'sound' | 'music' | 'track' | 'lang';

const RESUME = L('Резюме основателя', 'Founder’s résumé');
const NEW_STARTUP = L('Новый стартап', 'New startup');
const BACK = L('назад', 'back');
const CLAUDE = L('<b>❯ Клод</b>', '<b>❯ Claude</b>');

export async function menu(term: Terminal, meta: Meta, state: MenuState, version: string, saved: Run | null = null): Promise<MenuChoice> {
  for (;;) {
    term.clear();
    term.print('B2B SaaS', 'big');
    term.print(L('Собери стартап на ИИ своими руками. Команда — Клод. Деньги — твои.', 'Build an AI startup with your own hands. The team is Claude. The money is yours.'), 'dim');
    term.print('');
    if (meta.runs.length > 0) {
      const last = meta.runs[meta.runs.length - 1];
      term.print(`${L('прошлый стартап', 'previous startup')}: ${pastPitch(last)} — ${ENDING_TITLE[last.ending].toLowerCase()}`, 'dim small');
    }
    const options = [
      ...(saved ? [{ title: L('Продолжить компанию', 'Continue company'), note: `${pitch(saved.idea)} · ${L('спринт', 'sprint')} ${saved.sprint}` }] : []),
      {
        title: meta.runs.length > 0 ? NEW_STARTUP : L('Основать стартап', 'Found a startup'),
        note: meta.lessons.length > 0 ? L(`30 спринтов · уроков основателя: ${meta.lessons.length}`, `30 sprints · founder lessons: ${meta.lessons.length}`) : L('30 спринтов · компания сохраняется', '30 sprints · your company is saved'),
      },
      { title: RESUME, note: meta.runs.length > 0 ? L(`стартапов: ${meta.runs.length}`, `startups: ${meta.runs.length}`) : L('пока пустое', 'empty so far') },
      { title: L(`Звук: ${state.sound ? 'включён' : 'выключен'}`, `Sound: ${state.sound ? 'on' : 'off'}`) },
      { title: L(`Музыка: ${state.music ? 'включена' : 'выключена'}`, `Music: ${state.music ? 'on' : 'off'}`) },
      { title: L(`Трек: ${state.track}`, `Track: ${state.track}`), note: L('Enter — следующий', 'Enter — next') },
      { title: L('Титры', 'Credits') },
      // the note is in the other language: whoever cannot read the menu finds the way out of it
      { title: L('Язык: русский', 'Language: English'), note: L('switch to English', 'переключить на русский') },
    ];
    const picked = await term.ask(options, L(`версия ${version}`, `version ${version}`));
    if (saved && picked === 0) return 'continue';
    const k = picked - (saved ? 1 : 0);
    if (k === 0) return 'start';
    if (k === 1) await resume(term, meta);
    if (k === 2) return 'sound';
    if (k === 3) return 'music';
    if (k === 4) return 'track';
    if (k === 5) {
      term.clear();
      term.print(L('Титры', 'Credits'), 'mid');
      for (const line of CREDITS) term.print(line, 'small');
      await term.wait(BACK);
    }
    if (k === 6) return 'lang';
  }
}

/** The founder's résumé: what was built before and what it taught. */
export async function resume(term: Terminal, meta: Meta): Promise<void> {
  term.clear();
  term.print(RESUME, 'mid');
  if (meta.runs.length === 0) {
    term.print(L('Опыт: нет. Амбиции: есть.', 'Experience: none. Ambition: plenty.'), 'dim');
  } else {
    term.print(L(`серийный предприниматель · стартапов: ${meta.runs.length}`, `serial entrepreneur · startups: ${meta.runs.length}`), 'dim');
    term.print('');
    for (const r of meta.runs.slice(-7)) {
      const how =
        r.ending === 'sold'
          ? L(`продан за <em>${money(r.soldFor)}</em>`, `sold for <em>${money(r.soldFor)}</em>`)
          : r.ending === 'profit'
            ? L('<em>вышел на прибыль</em>', '<em>turned a profit</em>')
            : r.ending === 'late'
              ? L('время вышло', 'ran out of time')
              : L('<strong>банкротство</strong>', '<strong>bankruptcy</strong>');
      term.print(`${pastPitch(r)} — ${how}, ${clock(r.lived)}${r.value ? ` · ${L('оценка', 'valuation')} ${money(r.value)}` : ''}`, 'small');
    }
  }
  // the traits: what grows with every startup
  const grown = TRAITS.filter((t) => (meta.traits[t.id] ?? 0) > 0);
  if (grown.length > 0) {
    term.print('');
    term.print(L('черты основателя:', 'founder’s traits:'), 'dim');
    for (const t of grown) {
      const level = meta.traits[t.id] ?? 0;
      term.print(`<b>${t.title}</b> ${'■'.repeat(level)}${'□'.repeat(t.max - level)} — ${traitGives(t, level)}`, 'small');
    }
  }
  term.print('');
  if (meta.lessons.length > 0) {
    term.print(L('чему научился:', 'lessons learned:'), 'dim');
    for (const id of meta.lessons) {
      const l = LESSONS.find((x) => x.id === id);
      if (l) term.print(`<b>${l.title}</b> — ${l.gives}`, 'small');
    }
  } else term.print(L('уроков пока нет: их даёт только законченный стартап', 'no lessons yet: only a finished startup gives them'), 'dim small');
  await term.wait(BACK);
}

/** what a card does, one fact a line: «чек ×1,5, но и токенов уходит ×1,5» → two lines */
function facts(does: string): string[] {
  return does === '' ? [] : does.split(', ').map((x) => x.replace(L(/^но и /, /^but /), ''));
}

function traitCard(t: Trait, level: number, kicker: string, to: number): Card {
  const now = level > 0 ? L(`сейчас: ${traitGives(t, level)}`, `now: ${traitGives(t, level)}`) : L('сейчас этой черты нет', 'you don’t have this trait yet');
  return { kicker, title: t.title, note: t.note, art: t.art, facts: [`${traitGives(t, to)}`, now] };
}

/**
 * Three decks, three cards dealt from each: the idea is mixed by hand. A founder with traits then
 * picks one to lean on twice as hard in this startup.
 */
export async function mixIdea(term: Terminal, seed: number, meta: Meta): Promise<{ idea: Idea; boost: string }> {
  const deal = dealIdea(seed, meta.runs.length);
  term.clear();
  await term.type([L('❯ Опишите стартап в трёх словах. Слово первое: какой у нас ИИ?', '❯ Describe the startup in three words. Word one: what kind of AI is it?')], '');
  const tech = deal.tech[await term.cards(deal.tech.map((c) => ({ kicker: L('какой ИИ', 'what kind of AI'), title: L(`${c.adj} ИИ`, `${c.adj} AI`), note: c.note, art: CARD_ART[c.id], facts: facts(c.does) })))];

  term.clear();
  term.print(L(`${tech.adj} ИИ-…`, `${tech.adj} AI …`), 'mid');
  await term.type([L('Слово второе: на что это похоже?', 'Word two: what is it like?')], '');
  const form = deal.form[await term.cards(deal.form.map((c) => ({ kicker: L('на что похоже', 'what it is like'), title: L(`ИИ-${c.name}`, `AI ${c.name}`), note: c.note, art: CARD_ART[c.id], facts: facts(c.does) })))];

  term.clear();
  term.print(L(`${tech.adj} ИИ-${form.name} для…`, `${tech.adj} AI ${form.name} for…`), 'mid');
  await term.type([L('Слово третье: кому это продаём?', 'Word three: who do we sell it to?')], '');
  const aud =
    deal.aud[
      await term.cards(
        deal.aud.map((c) => ({
          kicker: L('кому продаём', 'who we sell to'),
          title: L(`для ${c.name}`, `for ${c.name}`),
          note: c.note,
          art: c.texture,
          facts: [L(`клиент платит от ${rate(c.pay / TUNING.sprint_s)} в секунду`, `a client pays from ${rate(c.pay / TUNING.sprint_s)} per second`), ...facts(c.does)],
        })),
      )
    ];

  // the founder's traits: one of them counts twice in this startup
  let boost = '';
  const grown = TRAITS.filter((t) => (meta.traits[t.id] ?? 0) > 0);
  // one trait is no choice: it is the bet by itself
  if (grown.length === 1) boost = grown[0].id;
  if (grown.length > 1) {
    term.clear();
    term.print(pitch({ tech, form, aud }), 'mid');
    await term.type([L('На что сделаем ставку? Эта черта в этом стартапе сработает вдвое.', 'What do we bet on? This trait will count double in this startup.')], '');
    const three = grown.slice(0, 3);
    boost = three[await term.cards(three.map((t) => traitCard(t, meta.traits[t.id] ?? 0, L('ставка стартапа · ×2', 'the startup’s bet · ×2'), (meta.traits[t.id] ?? 0) * 2)))].id;
  }

  const idea: Idea = { tech, form, aud };
  term.clear();
  term.print(pitch(idea), 'mid');
  const minutes = dec(Math.round((TUNING.start_money / (TUNING.living_per_s + TUNING.tiers.fast.cost_per_s) / 60) * 10) / 10);
  const lines = [
    CLAUDE,
    L('Звучит как стартап. Инвесторов у нас нет — есть твои сбережения.', 'Sounds like a startup. We have no investors — we have your savings.'),
    L(`Их хватит минут на ${minutes}, если ничего не продадим.`, `They will last about ${minutes} minutes if we sell nothing.`),
    L(`У тебя ${TUNING.last_sprint} спринтов. Выведи компанию в прибыль к последнему релизу — или выгодно продай.`, `You have ${TUNING.last_sprint} sprints. Make the company profitable by the final release — or sell at a good price.`),
  ];
  const last = meta.runs[meta.runs.length - 1];
  // the same founder, a new session of Claude: the past is told to him, not remembered
  if (last) lines.splice(1, 0, AGAIN_SAYS[last.ending] ?? AGAIN_SAYS.broke);
  if (meta.runs.length >= 3) {
    lines.push(L(`Это твой ${meta.runs.length + 1}-й стартап. В резюме это называется «опыт».`, `This is your startup number ${meta.runs.length + 1}. On a résumé that is called “experience”.`));
  }
  if (meta.lessons.length > 0) lines.push(L(`С тобой твой опыт: уроков — ${meta.lessons.length}.`, `Your experience comes along: lessons — ${meta.lessons.length}.`));
  const bet = TRAITS.find((t) => t.id === boost);
  if (bet) {
    const gives = traitGives(bet, (meta.traits[bet.id] ?? 0) * 2);
    lines.push(L(`Ставка этого стартапа — <em>${bet.title.toLowerCase()}</em>: ${gives}.`, `This startup’s bet is <em>${bet.title.toLowerCase()}</em>: ${gives}.`));
  }
  await term.type(lines, '');
  if (meta.runs.length === 0) {
    // the first startup: how the sheet works, in four lines — the rest is taught on the sheet itself
    term.print('');
    term.print(L('как это устроено:', 'how it works:'), 'dim small');
    term.print(L('1. Справа — блоки. Выбери блок, потом клетку на чертеже.', '1. Blocks are on the right. Pick a block, then a cell on the blueprint.'), 'small');
    term.print(L('2. Задачи идут по очереди. Улучшения остаются в своих зданиях. Enter — помочь руками.', '2. Tasks share one queue. Upgrades stay in their buildings. Enter helps with the work.'), 'small');
    term.print(L(`3. Каждые ${TUNING.sprint_s} секунды релиз и выбор одной из трёх карт. На выборе время стоит.`, `3. Every ${TUNING.sprint_s} seconds: release and a choice of three cards. Time pauses for the choice.`), 'small');
    term.print(
      L('4. Клиенты придут после ядра и лендинга. Платить начнут после «Приёма оплаты».', '4. Clients come after the core and the landing page. They start paying after “Payments”.'),
      'small',
    );
    term.print(L('5. Ты один и проверяешь одно направление: там работа идёт быстрее и чище.', '5. There is one of you, and you review one lane: work there goes faster and cleaner.'), 'small');
    term.print(L('Что делать дальше, всегда написано под счётчиком денег.', 'What to do next is always written under the money counter.'), 'dim small');
  }
  await term.wait(L('начать', 'start'));
  return { idea, boost };
}

/** The end of a startup: the founder's post, the numbers, what was learned. Returns when the player wants the next one. */
export async function ending(term: Terminal, run: Run, meta: Meta, persist = true): Promise<void> {
  const got = finish(run, meta);
  if (persist) saveMeta(meta);
  term.open(`${L('конец', 'the end')} · ${ENDING_TITLE[run.over ?? 'broke'].toLowerCase()}`);
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
    for (const l of got) term.print(`${L('урок', 'lesson')}: <b>${l.title}</b> — <em>${l.gives}</em>`, 'small');
    if (got.length === 0) term.print(L('новых уроков нет: всё это ты уже проходил', 'no new lessons: you have been through all of this before'), 'dim small');
    term.print('');
    // and the post itself, for those who read posts
    term.print(L('пост основателя', 'the founder’s post'), 'dim small');
    for (const line of endingPost(run)) term.print(line, 'dim small');
    if (!learned) {
      // every startup, whatever its end, makes the founder better at one thing: a card out of three
      learned = true;
      const choices = traitChoices(meta, run.seed);
      if (choices.length > 0) {
        await term.wait(L('дальше: чему ты научился', 'next: what you have learned'));
        term.clear();
        term.print(L('Чему ты научился в этом стартапе?', 'What did this startup teach you?'), 'mid');
        term.print(L('черта остаётся с тобой во всех следующих стартапах', 'the trait stays with you in every startup to come'), 'dim small');
        const kicker = (t: Trait): string => {
          const next = (meta.traits[t.id] ?? 0) + 1;
          return L(`черта основателя · уровень ${next} из ${t.max}`, `founder’s trait · level ${next} of ${t.max}`);
        };
        const pick = choices[await term.cards(choices.map((t) => traitCard(t, meta.traits[t.id] ?? 0, kicker(t), (meta.traits[t.id] ?? 0) + 1)))];
        raise(meta, pick.id);
        if (persist) saveMeta(meta);
        term.clear();
        term.print(`${pick.title}: ${L('уровень', 'level')} ${meta.traits[pick.id]}`, 'mid');
        term.print(traitGives(pick, meta.traits[pick.id] ?? 0), 'small');
        // what the next startup will see for the first time
        const fresh = unlockedNow(meta.runs.length);
        if (fresh.length > 0) {
          term.print('');
          term.print(L('новое в следующем стартапе:', 'new in the next startup:'), 'dim small');
          for (const name of fresh) term.print(L(`карта идеи <b>«${name}»</b>`, `idea card <b>“${name}”</b>`), 'small');
        }
      }
    }
    const k = await term.ask([{ title: NEW_STARTUP, note: L('тот же основатель, новая идея', 'same founder, a new idea') }, { title: RESUME }]);
    if (k === 0) return;
    await resume(term, meta);
  }
}
