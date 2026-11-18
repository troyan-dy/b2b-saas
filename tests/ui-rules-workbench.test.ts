import { describe, expect, it } from 'vitest';
import { DRAFT_CARDS } from '../src/systems/run/draft';
import { cellsMax, clientsMax, refreshRun, RULES, TUNING } from '../src/systems/run/run';
import { buildReason } from '../src/ui/build-reasons';
import { productEffects, projectName, workbenchView } from '../src/ui/workbench-view';
import { block, client, newRun, report, selection, task } from './ui-rules-fixtures';

describe('workbench', () => {
  it('explains the first available build, locked builds, level increments and a full plot', () => {
    const run = newRun();
    const first = workbenchView(run, { ...selection, picked: 'core' });
    expect(first.modules.find((m) => m.id === 'core')).toMatchObject({
      action: 'place',
      disabled: false,
      selected: true,
      level: 0,
    });
    expect(first.modules.find((m) => m.id === 'pay')?.actionLabel).toBe('Сначала ядро');
    expect(first.modules.some((m) => m.actionLabel === 'Не выпал в этом забеге')).toBe(true);
    expect(first.modules.some((m) => m.actionLabel?.startsWith('Этап'))).toBe(true);
    run.pool = Object.keys(RULES).filter((k) => RULES[k].role !== 'base');
    run.blocks = [block('core', { level: 5 }), block('landing', { i: 2 }), block('bot', { i: 1 })];
    while (run.blocks.length < cellsMax(run)) {
      const kind = run.pool.find((k) => !run.blocks.some((b) => b.kind === k))!;
      run.blocks.push(block(kind, { i: run.blocks.length }));
    }
    refreshRun(run);
    const built = workbenchView(run, selection);
    expect(built.modules.find((m) => m.id === 'core')).toMatchObject({
      action: 'none',
      actionLabel: 'Максимальный уровень',
      nextHosting: undefined,
    });
    expect(built.modules.find((m) => m.id === 'landing')).toMatchObject({
      action: 'upgrade',
      canDemolish: false,
      level: 1,
    });
    expect(built.modules.find((m) => m.id === 'bot')!.canDemolish).toBe(true);
    expect(built.modules.find((m) => m.id === 'pay')).toMatchObject({
      needsLand: true,
      actionLabel: 'Нет свободной клетки',
    });
    expect(built.modules.some((m) => m.links?.some((link) => link.startsWith('Работает:')))).toBe(
      true,
    );
    expect(productEffects('audit', 2)).toContain('нагрузка крупных −20%');
    expect(productEffects('audit', 1)).not.toContain('нагрузка крупных');
    expect(projectName('infrastructure')).toBe('Инфраструктура');
    expect(projectName('mass')).toBe(DRAFT_CARDS.find((c) => c.id === 'mass')!.title);
    expect(projectName('legacy-project')).toBe('legacy-project');
  });
  it('reports paid work, reorder bounds, queued reservations and remaining infrastructure progress', () => {
    const run = newRun();
    run.money = 40;
    run.blocks = [block('core', { live: false, built: false, done: 2, need: 20 })];
    run.tasks = [
      task('core', { cost: 100 }),
      task('infra', { kind: 'infrastructure', block: undefined, work: 8, done: 2 }),
      task('card', { kind: 'card', block: undefined, card: 'mass', status: 'backlog' }),
    ];
    const next = () => workbenchView(run, { ...selection, selectedAgent: run.agents[0]?.id });
    let view = next();
    expect(view.tasks.map((t) => [t.id, t.canMoveUp, t.canMoveDown, t.position])).toEqual([
      ['core', false, true, 1],
      ['infra', true, false, 2],
      ['card', false, false, undefined],
    ]);
    expect(view.tasks[0].detail).toContain('не хватает $60');
    expect(view.tasks[2]).toMatchObject({ canResume: true, title: projectName('mass') });
    expect(view.infrastructure).toMatchObject({
      taskId: 'infra',
      progress: 0.25,
      status: 'queued',
      helpDisabled: true,
    });
    expect(view.budget.planned).toBe(26);
    run.tasks[0].status = 'backlog';
    expect(next().modules.find((m) => m.id === 'core')?.api).toBeUndefined();
    run.tasks[0].status = 'active';
    run.cardStacks.mass = 2;
    view = next();
    expect(view.modules.find((m) => m.id === 'core')).toMatchObject({
      taskId: 'core',
      current: 'Ещё не выпущен',
      actionLabel: 'Строится',
    });
    expect(view.tasks[1].position).toBe(2);
    expect(view.perks?.[0].title).toContain('×2');
    expect(view.modules.find((m) => m.id === 'core')!.specialization).toContain('×2');
    expect(view.agent?.salary).toBeGreaterThan(0);
    run.tasks = [
      task('infra', {
        kind: 'infrastructure',
        block: undefined,
        status: 'active',
        work: 8,
        done: 3,
      }),
    ];
    expect(next().infrastructure).toMatchObject({ helpDisabled: false, api: { remainingWork: 5 } });
    run.tasks[0].status = 'ready';
    expect(next().infrastructure).toMatchObject({ label: 'К релизу', api: undefined });
    run.tasks = [];
    run.blocks = [];
    expect(next().agent?.salary).toBe(0);
  });
  it('summarizes shipments and unfinished releases while preserving draft and news decisions', () => {
    const run = newRun();
    run.draft = ['rest'];
    const draft = () => workbenchView(run, selection).draft!;
    expect(draft().summary).toContain('Выбери одну карту');
    run.lastReport = report();
    expect(draft().summary).toContain('работа продолжается');
    run.lastReport = report({
      shipped: ['core'],
      projects: ['infrastructure', 'mass', 'legacy-project'],
    });
    const news = { title: 'Рынок', text: 'Продажи' };
    const view = workbenchView(run, { ...selection, news });
    expect(view.draft?.summary).toContain('Инфраструктура');
    expect(view.draft?.summary).toContain('legacy-project');
    expect(view.draft?.news).toBe(news);
    expect(view.segments.every((s) => s.priceDisabled)).toBe(true);
  });
  it('groups contracts, prices previews, and chooses the next action for each open request', () => {
    const run = newRun();
    run.pool = ['cheap', 'bot', 'onb', 'crm', 'mobile'];
    run.blocks = [
      block('core'),
      block('bot', { i: 1 }),
      block('crm', { i: 2 }),
      block('onb', { live: false, i: 3 }),
    ];
    refreshRun(run);
    run.tasks = [task('work', { block: 'onb' })];
    run.clients = [
      client({ name: 'А', type: 'corp', happy: true }),
      client({ name: 'Б', type: 'gov', want: 'onb' }),
      client({ name: 'В', type: 'mid', want: 'removed', promised: true }),
      client({ name: 'Г', want: 'bot', wantLevel: 1 }),
      client({ name: 'Д', want: 'bot', wantLevel: 3 }),
      client({ name: 'Е', want: 'mobile' }),
      client({ name: 'Ж', want: 'core', wantLevel: 8 }),
      client({ name: 'З', want: 'audit' }),
    ];
    const [small, medium, large] = run.market.groups;
    small.profiles[0].needs = [
      { block: 'unlisted', level: 1 },
      { block: 'bot', level: 1 },
    ];
    large.profiles[0].connection = ['bot', 'crm'];
    medium.profiles[0].connection = ['core', 'audit'];
    small.pendingPrice = 1.5;
    small.profiles[0].count = 900;
    medium.lastShift = { sprint: 4, theme: 'quality', block: 'api', before: 1, after: 2 };
    large.lastShift = { sprint: 4, theme: 'share', block: 'crm', before: 20, after: 25 };
    small.lastShift = { sprint: 4, theme: 'price', before: 1, after: 1.1 };
    const view = workbenchView(run, { ...selection, previewPrices: { small: 1.25, large: 1.2 } });
    const [s, m, l] = view.segments;
    expect([s.previewPrice, m.previewPrice, l.previewPrice]).toEqual([1.5, 1, 1.2]);
    expect(s.needs.find((n) => n.block === 'unlisted')).toMatchObject({
      action: 'none',
      disabled: true,
      actionLabel: 'Нет в наборе',
    });
    expect(s.needs.find((n) => n.block === 'bot')).toMatchObject({
      action: 'none',
      disabled: true,
      effect: 'Уровень выпущен',
    });
    expect(s.reasons).toEqual(
      expect.arrayContaining(['Расширь инфраструктуру', expect.stringContaining('цене: 1 → 1,1')]),
    );
    expect(m.reasons).toContainEqual(expect.stringContaining('v1 → v2'));
    expect(m.reasons).toContainEqual(expect.stringContaining('○ Соседство:'));
    expect(l.reasons).toContainEqual(expect.stringContaining('20% → 25%'));
    expect(l.reasons).toContainEqual(expect.stringContaining('✓ Соседство:'));
    expect(l.contracts?.[0].detail).toBe('Доволен');
    expect(l.contracts?.[1].button).toMatchObject({ action: 'inspect-module', block: 'onb' });
    expect(m.contracts?.[0]).toMatchObject({
      status: 'Нет в наборе',
      detail: expect.stringContaining('Обещано'),
    });
    expect(s.contracts?.[0].status).toBe('Уровень выпущен');
    expect(s.contracts?.[1].button).toMatchObject({ action: 'upgrade', label: 'Улучшить до v2' });
    expect(s.contracts?.[2].button?.action).toBe('place');
    small.lastShift = { sprint: 4, theme: 'demand', before: 1, after: 1.4 };
    expect(workbenchView(run, selection).segments[0].reasons).toContainEqual(
      expect.stringContaining('коэффициент спроса'),
    );
    run.eff.seats = TUNING.clients.slots;
    run.clients = Array.from({ length: clientsMax(run) }, () => client());
    expect(workbenchView(run, selection).segments[0].reasons).toContain(
      'Для нового договора нужно свободное место',
    );
  });
});

describe('build recommendation priority', () => {
  it('prefers a promised named contract over market share and otherwise ranks audience demand', () => {
    const run = newRun();
    for (const [i, g] of run.market.groups.entries()) {
      g.profiles.forEach((p) => {
        p.needs = [];
      });
      g.profiles[0].share = [15, 70, 30][i];
      g.profiles[0].needs = [{ block: 'bot', level: 2 }];
    }
    run.clients = [client({ promised: true }), client({ happy: true }), client({ name: 'Луна' })];
    expect(buildReason(run, 'bot')).toMatchObject({
      label: 'Обещано клиенту',
      detail: 'Вектор: v2 · Луна: v2',
    });
    run.clients[0].promised = false;
    expect(buildReason(run, 'bot')?.label).toContain('70% средних');
    run.market.groups.forEach((g) =>
      g.profiles.forEach((p) => {
        p.needs = [];
      }),
    );
    expect(buildReason(run, 'bot')).toMatchObject({ label: 'Ждут договоры: 2' });
    run.market.groups[0].profiles[0].count = 1;
    expect(buildReason(run, 'cheap')?.label).toContain('Снизит счёт');
    expect(buildReason(run, 'landing')?.label).toBe('Нужен для продаж');
    expect(buildReason(run, 'pay')?.label).toBe('Чтобы получать деньги');
    run.blocks = [block('core', { level: 2 })];
    run.clients = [];
    run.market.groups[0].profiles[0].count = 100;
    expect(buildReason(run, 'bot')?.tone).toBe('capacity');
    expect(buildReason(run, 'core')).toBeUndefined();
  });
});
