import { describe, expect, it, vi } from 'vitest';
import { buildCategory } from '../src/content/build-categories';
import { BLOCKS, BLOCK_BY_ID } from '../src/content/blocks';
import { CARD_ART } from '../src/content/cards';
import { CREDITS } from '../src/content/credits';
import { clock, endingPost, endingScore, endingStats, releaseRevenueRecord } from '../src/content/endings';
import { benefit, benefits, callAnswers, effectLine, releaseLines } from '../src/content/texts';
import { createRun, IDEAS, TUNING, type Ending } from '../src/systems/run/run';
import { money } from '../src/ui/format';

const idea = { tech: IDEAS.tech[0], form: IDEAS.form[0], aud: IDEAS.aud[0] };
function finished(over: Ending) {
  const run = createRun(17, idea);
  run.over = over;
  run.t = 65.9;
  run.stats.value = 990;
  run.stats.soldFor = 1010;
  return run;
}

describe('module catalog and effects', () => {
  it('indexes each module by its unique id and maps shop categories', () => {
    expect(Object.keys(BLOCK_BY_ID)).toHaveLength(BLOCKS.length);
    for (const block of BLOCKS) expect(BLOCK_BY_ID[block.id]).toBe(block);
    expect(['core', 'ab', 'crm', 'roles', 'new-id'].map(buildCategory)).toEqual(['product', 'growth', 'service', 'infra', 'product']);
    for (const card of [...IDEAS.tech, ...IDEAS.form]) expect(CARD_ART[card.id], card.id).toBeTruthy();
    expect(CREDITS.join(' ')).toContain('Phaser');
  });

  it.each([
    ['bot', '+2 места', ['+2 места', 'терпение +1'], '+2 места для клиентов · клиенты терпеливее на 1 спр.'],
    ['pay', 'чек +10%', ['чек малых +10%'], 'чек малого бизнеса +10% базы'],
    ['dash', 'чек +20%', ['чек крупных +20%'], 'чек крупных +20% базы'],
    ['landing', 'продвижение ×1,2', ['промо ×1,2'], 'продвижение ×1,2'],
    ['dark', 'сарафан ×2', ['сарафан ×2'], 'сарафан ×2'],
    ['cheap', 'токены ×0,5', ['токены ×0,5'], 'токены ×0,5'],
    ['shield', 'клиенты терпеливее на 1 спр.', ['терпение +1'], 'клиенты терпеливее на 1 спр.'],
    ['absent', '', [], ''],
  ] as const)('summarizes the effects of %s', (id, first, short, details) => {
    expect(benefit(id)).toBe(first);
    expect(benefits(id)).toEqual(short);
    expect(effectLine(id)).toBe(details);
  });
  it('removes exactly the first effect when the main benefit is already visible', () => {
    expect(effectLine('bot', true)).toBe('клиенты терпеливее на 1 спр.');
    expect(effectLine('pay', true)).toBe('');
  });
  it('keeps an unfamiliar effect readable when the balance data gains a new multiplier', async () => {
    vi.resetModules();
    vi.doMock('../src/data/balance/effects.json', () => ({ default: { upcoming: { visitors: 1.5 } } }));
    try {
      const texts = await import('../src/content/texts');
      expect(texts.benefits('upcoming')).toEqual(['visitors ×1,5']);
      expect(texts.benefit('upcoming')).toBe('visitors ×1,5');
      expect(texts.effectLine('upcoming')).toBe('visitors ×1,5');
    } finally {
      vi.doUnmock('../src/data/balance/effects.json');
      vi.resetModules();
    }
  });
});

describe('release report', () => {
  const quiet = { sprint: 4, shipped: [], came: 0, left: 0, closed: 0, reasons: [], mrr: 4, tokens: 2, debt: 0, down: false };
  it('shows subscriptions and tokens in the same units and distinguishes outage, missing payments and debt', () => {
    const calm = releaseLines(quiet).join(' ');
    expect(calm).toMatch(/ничего.*подписки.*\+\$4\/с.*токены −\$2\/с/);
    expect(calm).not.toMatch(/долг|ушёл/);
    expect(releaseLines({ ...quiet, debt: 8 }).join(' ')).toContain('долг 8 — держится');
    expect(releaseLines({ ...quiet, debt: 20 }).join(' ')).toContain('долг 20 — следующий релиз');
    const outage = releaseLines({ ...quiet, debt: 20, down: true }).join(' ');
    expect(outage).toContain('продукт лежит');
    expect(outage).not.toMatch(/подписки|долг/);
    const unpaid = releaseLines({ ...quiet, unpaid: 3 }).join(' ');
    expect(unpaid).toContain('нет «Приёма оплаты»');
    expect(unpaid).toContain('токены за них: −$2 в секунду');
  });
  it('separates new customers, missing-feature churn and independent closures', () => {
    expect(releaseLines({ ...quiet, shipped: ['Бот'], came: 1 }).join(' ')).toMatch(/выпущено: Бот.*\+1<\/em> клиент/);
    expect(releaseLines({ ...quiet, came: 2, left: 1, reasons: ['CRM'] }).join(' ')).toMatch(/\+2<\/em> клиента.*−1.*нет «CRM»/);
    expect(releaseLines({ ...quiet, left: 1, closed: 1 }).join(' ')).toMatch(/новых клиентов нет.*ушёл молча.*закрылся сам/);
    expect(releaseLines({ ...quiet, came: 5, closed: 2 }).join(' ')).toMatch(/\+5<\/em> клиентов.*−2 клиента закрылись сами/);
    expect(releaseLines({ ...quiet, left: 2 }).join(' ')).toContain('−2</strong> ушли молча');
    expect(releaseLines({ ...quiet, left: 5, reasons: ['API'] }).join(' ')).toContain('−5</strong> ушли: нет «API»');
    const [honest, promise] = callAnswers(0.844, 1.255, 3);
    expect(honest).toContain('скидкой 16%');
    expect(promise).toMatch(/25% больше.*за 3 спринта/);
  });
  it('uses English singular and plural independently of Russian number endings', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { location: { search: '?lang=en' } });
    try {
      const { releaseLines: english } = await import('../src/content/texts');
      expect(english({ ...quiet, came: 1, closed: 1 }).join(' ')).toMatch(/\+1<\/em> client .*−1 client shut down by itself/);
      expect(english({ ...quiet, came: 21, closed: 21 }).join(' ')).toMatch(/\+21<\/em> clients .*−21 clients shut down by themselves/);
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});

describe('ending reports', () => {
  it('keeps clock and release revenue in display units', () => {
    expect(clock(59.9999999)).toBe('1:00');
    expect(clock(60.9)).toBe('1:00');
    expect(releaseRevenueRecord(TUNING.sprint_s * 4)).toBe('Рекорд выручки на релизе $4/с');
  });
  it('reports the deal price separately from valuation even during a supplier outage', () => {
    const run = finished('sold');
    expect(endingScore(run)[0]).toBe(`<em>${money(1010)}</em>`);
    expect(endingPost(run).join(' ')).toContain(`куплен за <em>${money(1010)}`);
    expect(endingStats(run)).toContain('оценка $990');
    run.downWhy = 'supplier';
    expect(endingPost(run).join(' ')).toContain(`куплен за <em>${money(1010)}`);
    run.over = 'profit';
    expect(endingPost(run).join(' ')).toContain('без поставщика');
  });
  it('distinguishes earlier profit and actual finish-line profit', () => {
    const run = finished('late');
    run.stats.profitAt = 0;
    expect(endingScore(run)[1]).toContain('прибыльных релизов не было');
    expect(endingPost(run).join(' ')).toContain('До прибыли так и не добрались');
    run.stats.profitAt = 2;
    expect(endingScore(run)[1]).toContain('раньше компания выходила в плюс');
    expect(endingPost(run).join(' ')).toContain('финишировали в минусе');
    run.over = 'profit';
    expect(endingScore(run)[0]).toBe('<em>$990</em>');
    expect(endingPost(run).join(' ')).toContain('ни разу не лежал');
    run.stats.downs = 2;
    run.mortgaged = true;
    expect(endingPost(run).join(' ')).toMatch(/лежал 2 раза.*Квартиру, кстати, выкупил/);
    expect(endingStats(run)).not.toContain('оценка');
  });
  it('uses customer loss, broken promises and collateral in a bankruptcy report', () => {
    const run = finished('broke');
    expect(endingScore(run)[0]).toBe('1:05');
    expect(endingPost(run).join(' ')).toMatch(/Клиентов у нас не было.*Рынок оказался не готов/);
    Object.assign(run.stats, { clients: 4, left: 2, downs: 1, promises: 3, kept: 2, offered: 2, shortcuts: 1 });
    run.mortgaged = true;
    expect(endingPost(run).join(' ')).toMatch(/Ушло 2 из 4.*лежал 1 раз.*пообещал 3 функции.*Построил 2.*согласился 1.*Квартиру тоже забрали/);
    run.stats.left = 1;
    expect(endingPost(run).join(' ')).toContain('У нас было 4 клиента');
  });
});
