import { BLOCK_BY_ID } from '../content/blocks';
import { buildCategory } from '../content/build-categories';
import { LANE_NAME, TIER_TITLE, TIER_NOTE } from '../content/texts';
import { buildReason } from './build-reasons';
import { L } from '../core/lang';
import { companyContext, companyTotals } from '../systems/company/company';
import {
  MARKET,
  SEGMENTS,
  marketCapacity,
  priceForecast,
  segmentView,
  type MarketContext,
} from '../systems/company/market';
import { DRAFT_CARDS, draftCards } from '../systems/run/draft';
import { blockEffects, PRODUCTION, STRATEGY_IDS, strategyCount, projectCost } from '../systems/run/product';
import { activeWork, apiWorkQuote, remainingBuildCapacity } from '../systems/run/production';
import {
  cellsMax,
  clientsMax,
  agentSlots,
  officeQuote,
  OFFICE,
  agentWorkRate,
  agentDebtPerWork,
  agentFixPerWork,
  busy,
  handy,
  clientPay,
  flows,
  linkBonus,
  links,
  reworkNeed,
  RULES,
  shelf,
  TUNING,
  workNeed,
  type Client,
  type Run,
  type WorkTask,
} from '../systems/run/run';
import { dec, money, multiplier, PER_S, rate, whole } from './format';
import type {
  SegmentId,
  WorkbenchModule,
  WorkbenchNeed,
  WorkbenchNews,
  WorkbenchSegment,
  WorkbenchTask,
  WorkbenchView,
} from './workbench';

export interface WorkbenchSelection {
  picked: string | null;
  selectedSegment: SegmentId;
  previewPrices: Partial<Record<SegmentId, number>>;
  news?: WorkbenchNews;
  panel?: 'module' | 'clients' | 'agent' | null;
  selectedAgent?: number;
  paused?: boolean;
  selectedModule?: string;
  clientAnchor?: { x: number; y: number };
  applied?: { title: string; impact: string } | null;
}

export const SEGMENT_TITLES: Record<SegmentId, string> = {
  small: L('Малые', 'Small'),
  medium: L('Средние', 'Medium'),
  large: L('Крупные', 'Large'),
};
const blockName = (id: string): string => BLOCK_BY_ID[id]?.name ?? id;
const shortName = (id: string): string => BLOCK_BY_ID[id]?.short ?? id;
export const projectName = (id: string): string =>
  id === 'infrastructure'
    ? L('Инфраструктура', 'Infrastructure')
    : (DRAFT_CARDS.find((card) => card.id === id)?.title ?? shortName(id));
const contractSegment = (client: Client): SegmentId =>
  client.type === 'corp' || client.type === 'gov'
    ? 'large'
    : client.type === 'mid'
      ? 'medium'
      : 'small';
const taskLabel = (status: WorkTask['status']): string =>
  ({
    queued: L('В очереди', 'Queued'),
    active: L('Строится', 'In progress'),
    ready: L('К релизу', 'For release'),
    backlog: L('В бэклоге', 'In backlog'),
  })[status];

export function capacityIndicator(utilization = 0) {
  const ratio = Math.max(0, utilization);
  const state = ratio > 1 ? 'overloaded' : ratio >= 0.8 ? 'busy' : 'spare';
  const labels = {
    overloaded: L('Перегруз · клиенты уходят', 'Overloaded · clients leave'),
    busy: L('Почти заполнено', 'Nearly full'),
    spare: L('Есть запас', 'Room to grow'),
  };
  return { percent: Math.round(ratio * 100), state, stateText: labels[state] };
}

export function canConfirmPrice(segment: WorkbenchSegment, drafting: boolean): boolean {
  return !(drafting || segment.pricePending || segment.priceDisabled || Math.abs(segment.previewPrice - segment.price) < 0.001);
}

export function landShortfall(cost: number, cash: number): number {
  return Math.ceil(Math.max(0, cost - cash));
}

export function catalogModules(modules: readonly WorkbenchModule[], category: WorkbenchModule['category'] | 'all'): WorkbenchModule[] {
  return modules.filter(module => category === 'all' || module.category === category)
    .sort((a, b) => Number(a.disabled) - Number(b.disabled) || Number(Boolean(b.reason)) - Number(Boolean(a.reason)));
}

export function productEffects(kind: string, level: number): string {
  const names: Record<string, string> = {
    seats: L('мест именных договоров', 'named contract slots'),
    patience: L('терпение договоров', 'contract patience'),
    word_of_mouth: L('сарафан', 'referrals'),
    corp_pay: L('крупный чек', 'large bills'),
    small_pay: L('малый/средний чек', 'small/medium bills'),
    promo: L('продвижение', 'promotion'),
    tokens: L('токены', 'tokens'),
  };
  const values = Object.entries(blockEffects(kind, level)).map(
    ([key, value]) =>
      key === 'small_pay' || key === 'corp_pay' ? `${names[key]} +${Math.round((value - 1) * 100)}% ${L('базы', 'base')}` : `${names[key] ?? key} ${key === 'seats' || key === 'patience' ? '+' : '×'}${dec(Number(value.toFixed(2)))}`,
  );
  const capacity = MARKET.capacity;
  if (kind === 'core')
    values.unshift(
      L(
        `вычисления +${capacity.core_per_level * level}`,
        `compute +${capacity.core_per_level * level}`,
      ),
    );
  const support = {
    bot: capacity.support_per_level,
    onb: capacity.onboarding_per_level,
    crm: capacity.crm_per_level,
  } as Record<string, number>;
  if (support[kind])
    values.unshift(L(`поддержка +${support[kind] * level}`, `support +${support[kind] * level}`));
  if (kind === 'landing') values.unshift(L('привлечение клиентов', 'client acquisition'));
  if (kind === 'pay') values.unshift(L('приём подписок', 'subscription billing'));
  if (kind === 'audit' && level >= 2)
    values.unshift(L('нагрузка крупных −20%', 'large-client load −20%'));
  return values.join(' · ');
}

function demand(run: Run, kind: string): string {
  const level = run.blocks.find((block) => block.kind === kind && block.live)?.level ?? 0;
  const ctx = companyContext(run);
  const demand = SEGMENTS.map((id) => segmentView(run.market, ctx, id))
    .map((group) => {
      const need = group.needs.find(need => need.block === kind && need.level > level);
      return need ? `${SEGMENT_TITLES[group.id]} ≈${whole(need.share)}%` : '';
    })
    .filter(Boolean);
  const contracts = run.clients.filter(
    (client) =>
      !client.happy &&
      client.want === kind &&
      client.wantLevel > level,
  ).length;
  if (contracts) demand.push(L(`договоры ${contracts}`, `contracts ${contracts}`));
  return demand.join(' · ');
}

function moduleLinks(run: Run, kind: string): string[] {
  const allowed = new Set(['core', 'landing', 'pay', ...run.pool]);
  const friends = Object.keys(RULES).filter(
    (other) =>
      other !== kind &&
      allowed.has(other) &&
      (RULES[kind].friends.includes(other) || RULES[other].friends.includes(kind)),
  );
  const active = links(run)
    .filter((pair) => pair.includes(kind))
    .map((pair) => shortName(pair.find((id) => id !== kind)!));
  const result = friends.length
    ? [
        L(
          `Рядом с ${friends.map(shortName).join(', ')}: +${Math.round(linkBonus(run) * 100)}% базового чека за связь`,
          `Next to ${friends.map(shortName).join(', ')}: +${Math.round(linkBonus(run) * 100)}% base bill per link`,
        ),
      ]
    : [];
  if (active.length)
    result.push(L(`Работает: ${active.join(', ')}`, `Active: ${active.join(', ')}`));
  return result;
}

function moduleView(
  run: Run,
  kind: string,
  picked: string | null,
  hostFactor: number,
): WorkbenchModule {
  const block = run.blocks.find((entry) => entry.kind === kind);
  const planned = run.tasks.find((task) => task.block === kind);
  const liveLevel = block?.live ? block.level : 0;
  const nextLevel = planned?.level ?? Math.min(PRODUCTION.max_level, liveLevel + 1);
  const work = planned?.work ?? (block?.live ? reworkNeed(run, block) : workNeed(run, kind));
  const unlocked = shelf(run).includes(kind);
  const needsLand = unlocked && run.blocks.length >= cellsMax(run);
  const canPlace = unlocked && !needsLand;
  const maxed = liveLevel >= PRODUCTION.max_level;
  let label: string | undefined;
  if (planned) label = taskLabel(planned.status);
  else if (maxed) label = L('Максимальный уровень', 'Maximum level');
  else if (!liveLevel && !canPlace)
    label =
      RULES[kind].role !== 'base' && !run.pool.includes(kind) ? L('Не выпал в этом забеге', 'Not drawn this run')
        : needsLand ? L('Нет свободной клетки', 'No free cell')
        : RULES[kind].stage > run.stage ? L(`Этап ${RULES[kind].stage}`, `Stage ${RULES[kind].stage}`)
        : L('Сначала ядро', 'Core first');
  const specializations =
    kind === 'core'
      ? STRATEGY_IDS.filter((id) => strategyCount(run, id) > 0).map((id) => `${DRAFT_CARDS.find((card) => card.id === id)?.title} ×${strategyCount(run, id)}`).join(' · ')
      : undefined;
  return {
    id: kind,
    category: buildCategory(kind),
    reason: buildReason(run, kind),
    title: blockName(kind),
    shortTitle:
      kind === 'core'
        ? blockName(kind)
        : shortName(kind).replace(/^./, (letter) => letter.toUpperCase()),
    level: liveLevel,
    current: liveLevel
      ? productEffects(kind, liveLevel)
      : planned
        ? L('Ещё не выпущен', 'Not shipped yet')
        : L('Не построен', 'Not built'),
    next:
      maxed && !planned
        ? L('Максимальный уровень', 'Maximum level')
        : `v${nextLevel}: ${productEffects(kind, nextLevel)}`,
    work,
    cost:
      planned?.cost ??
      projectCost(run, work, nextLevel),
    hosting: liveLevel
      ? RULES[kind].host * (1 + TUNING.rework.host_mult * (liveLevel - 1)) * hostFactor
      : 0,
    nextHosting:
      nextLevel > liveLevel
        ? RULES[kind].host * (1 + TUNING.rework.host_mult * (nextLevel - 1)) * hostFactor
        : undefined,
    demand: demand(run, kind),
    action: maxed ? 'none' : liveLevel ? 'upgrade' : 'place',
    actionLabel: label,
    disabled: Boolean(run.over || run.draft || planned || maxed || (!liveLevel && !canPlace)),
    selected: picked === kind,
    needsLand,
    specialization: specializations,
    links: moduleLinks(run, kind),
    canDemolish: Boolean(block?.live && !block.up && !planned && RULES[kind].role !== 'base'),
    taskId: planned?.id,
    api: planned ? apiWorkQuote(run, planned.id) ?? undefined : undefined,
  };
}

function taskView(run: Run, task: WorkTask, index: number, queued: WorkTask[]): WorkbenchTask {
  const card = DRAFT_CARDS.find((entry) => entry.id === task.card);
  const title = task.block
    ? `${blockName(task.block)} v${task.level ?? 1}`
    : (card?.title ??
      L(`Инфраструктура ${run.infrastructure + 1}`, `Infrastructure ${run.infrastructure + 1}`));
  const effect = task.block
    ? productEffects(task.block, task.level ?? 1)
    : (card?.impact ??
      L(
        `мощность ×${dec(MARKET.capacity.expansion_mult)} · рынок ×${dec(MARKET.acquisition.market_expansion_mult)}`,
        `capacity ×${MARKET.capacity.expansion_mult} · market ×${MARKET.acquisition.market_expansion_mult}`,
      ));
  const interested = task.block ? demand(run, task.block) : '';
  const noCash = task.status === 'queued' && index === 0 && run.money < task.cost;
  return {
    ...task,
    title,
    detail: [
      effect,
      interested,
      noCash
        ? L(
            `Для старта не хватает ${money(task.cost - run.money)}`,
            `${money(task.cost - run.money)} more needed to start`,
          )
        : '',
    ]
      .filter(Boolean)
      .join(' · '),
    canMoveUp: task.status === 'queued' && index > 0,
    canMoveDown: task.status === 'queued' && index >= 0 && index < queued.length - 1,
    canDefer: task.status === 'queued',
    canResume: task.status === 'backlog' && !run.draft,
  };
}

function segmentNeeds(
  run: Run,
  ctx: MarketContext,
  id: SegmentId,
  modules: WorkbenchModule[],
): WorkbenchNeed[] {
  return segmentView(run.market, ctx, id).needs.map((need) => {
    const module = modules.find((entry) => entry.id === need.block)!;
    const current = ctx.levels[need.block] ?? 0;
    const target = Math.min(need.level, current + 1);
    const fulfilled = current >= need.level;
    return {
      block: need.block,
      title: `${blockName(need.block)} v${need.level}`,
      count: need.count,
      share: need.share,
      effect: fulfilled
        ? L('Уровень выпущен', 'Level shipped')
        : L(
            `Шаг v${target} приблизит продукт к запросу`,
            `Step v${target} improves the fit`,
          ),
      action: fulfilled ? 'none' : (module?.action ?? 'none'),
      disabled: fulfilled || !module || module.disabled,
      actionLabel: !fulfilled
        ? (module?.actionLabel ?? (!module ? L('Нет в наборе', 'Not in toolkit') : undefined))
        : undefined,
    };
  });
}

function segmentPanel(
  run: Run,
  ctx: MarketContext,
  id: SegmentId,
  selection: WorkbenchSelection,
  modules: WorkbenchModule[],
): WorkbenchSegment {
  const segment = segmentView(run.market, ctx, id);
  const previewPrice = segment.pendingPrice ?? selection.previewPrices[id] ?? segment.price;
  const forecast = priceForecast(run.market, ctx, id, previewPrice);
  const group = run.market.groups.find((entry) => entry.id === id)!;
  const totals = companyTotals(run);
  const slots = clientsMax(run);
  const conditions = [
    L(`Именные договоры: ${run.clients.length}/${slots} мест`, `Named contracts: ${run.clients.length}/${slots} slots`),
    L(`Массовый рынок: нагрузка ${whole(totals.load)}/${whole(totals.capacity)}`, `Mass market: load ${whole(totals.load)}/${whole(totals.capacity)}`),
  ];
  if (run.clients.length >= slots) {
    const extra = run.pool.find(kind => !ctx.levels[kind] && (blockEffects(kind, 1).seats ?? 0) > 0);
    conditions.push(extra && slots < TUNING.clients.slots
      ? L(`Доп. места: выпусти «${blockName(extra)}»`, `More slots: ship ${blockName(extra)}`)
      : L('Для нового договора нужно свободное место', 'A new contract needs a free slot'));
  }
  if (totals.load > totals.capacity) conditions.push(L('Расширь инфраструктуру', 'Expand infrastructure'));
  for (const p of group.profiles) {
    if (!p.connection) continue;
    const [a, b] = p.connection;
    const adjacent = ctx.links.some((pair) => pair.includes(a) && pair.includes(b));
    conditions.push((adjacent ? '✓ ' : '○ ') + L(`Соседство: ${blockName(a)} + ${blockName(b)} (${whole(p.share)}% сегмента)`, `Adjacent: ${blockName(a)} + ${blockName(b)} (${whole(p.share)}% of segment)`));
  }
  const shift = group.lastShift;
  if (shift && Number.isFinite(shift.before) && Number.isFinite(shift.after)) {
    const topic = shift.theme === 'share' && shift.block ? L(`доля профиля «${blockName(shift.block)}»`, `share requesting ${blockName(shift.block)}`)
      : shift.block ? blockName(shift.block) : shift.theme === 'price' ? L('поправка к приемлемой цене', 'price tolerance adjustment') : L('коэффициент спроса', 'demand multiplier');
    const value = (n: number) => (shift.theme === 'quality' ? 'v' : '') + dec(Number(n.toFixed(2))) + (shift.theme === 'share' ? '%' : '');
    conditions.push(L(`Релиз ${shift.sprint}`, `Release ${shift.sprint}`) + ` · ${topic}: ${value(shift.before)} → ${value(shift.after)}`);
  }
  const labels: Record<string, string> = {
    needs: L('потребности', 'needs'),
    price: L('цена', 'price'),
    overload: L('перегруз', 'overload'),
    outage: L('сбой', 'outage'),
    delay: L('задержка', 'delay'),
    debt: L('техдолг', 'debt'),
  };
  const signed = run.clients.filter((client) => contractSegment(client) === id);
  const contractIncome = signed.reduce((sum, client) => sum + clientPay(run, client), 0);
  const contracts = signed.map((client) => {
    const title = `${client.name} · ${rate(clientPay(run, client) / TUNING.sprint_s)}${PER_S}`;
    if (client.happy) return { title, detail: L('Доволен', 'Happy') };
    const detail = L(
      `${client.promised ? 'Обещано' : 'Ждёт'} ${blockName(client.want)} v${client.wantLevel} · ${client.patience} спр.`,
      `${client.promised ? 'Promised' : 'Waiting for'} ${blockName(client.want)} v${client.wantLevel} · ${client.patience} sprints`,
    );
    const module = modules.find((entry) => entry.id === client.want);
    const block = client.want;
    if (!module) return { title, detail, status: L('Нет в наборе', 'Not in toolkit') };
    if (module.level >= client.wantLevel) return { title, detail, status: L('Уровень выпущен', 'Level shipped') };
    if (module.taskId) return {
      title, detail, status: module.actionLabel,
      button: { block, action: 'inspect-module' as const, label: L('Открыть задачу', 'Open task'), disabled: false },
    };
    const next = `v${module.level + 1}`;
    const label = module.actionLabel ?? (module.action === 'place'
      ? L(`Разместить ${next}`, `Place ${next}`)
      : L(`Улучшить до ${next}`, `Upgrade to ${next}`));
    return { title, detail, button: { block, action: module.action, label, disabled: module.disabled } };
  });
  return {
    id,
    title: SEGMENT_TITLES[id],
    count: segment.count + contracts.length,
    marketIncome: segment.income / TUNING.sprint_s,
    contractIncome: contractIncome / TUNING.sprint_s,
    happiness: segment.satisfaction,
    delta: segment.delta,
    leads: segment.leads,
    market: segment.market,
    price: segment.price,
    previewPrice,
    pricePending: segment.pendingPrice !== null,
    priceDisabled: Boolean(run.draft || run.over),
    priceLabel: `${rate(segment.unitPrice / TUNING.sprint_s)}${PER_S}`,
    forecast: L(
      `Следующий релиз при ${multiplier(previewPrice)}: ≈${rate(forecast.income / TUNING.sprint_s)}${PER_S} по общему тарифу, отток ≈${forecast.lost}.`,
      `Next release at ${multiplier(previewPrice)}: ≈${rate(forecast.income / TUNING.sprint_s)}${PER_S} at the shared tariff, ≈${forecast.lost} leaving.`,
    ),
    needs: segmentNeeds(run, ctx, id, modules),
    reasons: conditions.concat(Object.entries(segment.reasons)
      .filter(([, value]) => value >= 0.5)
      .map(([key, value]) => `${key === 'needs' ? '+' : '−'}${Math.round(value)} ${labels[key]}`)),
    contracts,
  };
}

export function workbenchView(run: Run, selection: WorkbenchSelection): WorkbenchView {
  const ctx = companyContext(run);
  const totals = companyTotals(run);
  const rawHost = run.host + totals.hosting;
  const cash = flows(run);
  // Living and hosting share the founder's thrift discount, including before the first build.
  const hostFactor =
    rawHost > 0
      ? cash.hosting / rawHost
      : TUNING.living_per_s > 0
        ? cash.living / TUNING.living_per_s
        : 1;
  const modules = Object.keys(RULES)
    .map((kind) => moduleView(run, kind, selection.picked, hostFactor));
  const queued = run.tasks.filter((task) => task.status === 'queued');
  const current = activeWork(run) ?? queued[0];
  const tasks = run.tasks.map((task) => ({
    ...taskView(run, task, queued.indexOf(task), queued),
    canHelp: task === current && !selection.paused && !run.draft && run.energy >= 1 && handy(run, 'build'),
    position: task.status === 'queued' ? queued.indexOf(task) + (current?.status === 'active' ? 2 : 1) : undefined,
  }));
  const report = run.lastReport;
  const shipped = report
    ? [...report.shipped.map(shortName), ...(report.projects ?? []).map(projectName)].join(', ')
    : '';
  const summary = report
    ? L(
        `Релиз ${report.sprint}: ${shipped || 'работа продолжается'}. Клиенты +${report.came} / −${report.left}. Подписки ${rate(report.mrr / TUNING.sprint_s)}/с.`,
        `Release ${report.sprint}: ${shipped || 'work continues'}. Clients +${report.came} / −${report.left}. Subscriptions ${rate(report.mrr / TUNING.sprint_s)}/s.`,
      )
    : L(
        'Выбери одну карту. Усиление сработает сразу.',
        'Pick one card. Its effect starts immediately.',
      );
  const infra = PRODUCTION.infrastructure;
  const infraTask = run.tasks.find((task) => task.kind === 'infrastructure');
  const active = activeWork(run);
  const agent = run.agents.find((item) => item.id === selection.selectedAgent);
  return {
    office: { cells: cellsMax(run), used: run.blocks.length, gain: Math.min(OFFICE.land.cells, run.pool.length + 3 - cellsMax(run)), totalCells: run.pool.length + 3, slots: agentSlots(run), landCost: officeQuote(run, 'land'), deskCost: officeQuote(run, 'desks'), money: run.money, maxSlots: OFFICE.desks.max },
    panel: selection.panel,
    agent: agent ? {
      id: agent.id,
      title: TIER_TITLE[agent.tier],
      description: TIER_NOTE[agent.tier],
      lane: LANE_NAME[agent.lane],
      rate: agentWorkRate(run, agent),
      topRate: TUNING.tiers.think.work_per_s * TUNING.review_boost,
      fixRate: agentWorkRate(run, {...agent, lane: 'fix'}) * agentFixPerWork(agent.tier),
      debt: agentDebtPerWork(run, {...agent, lane: 'build'}),
      salary: busy(run, agent) ? TUNING.tiers[agent.tier].cost_per_s : 0,
      tariff: TUNING.tiers[agent.tier].cost_per_s,
      working: busy(run, agent),
      reviewed: run.review === agent.lane,
    } : undefined,
    clientAnchor: selection.clientAnchor,
    selectedModule: selection.selectedModule,
    applied: selection.applied,
    perks: STRATEGY_IDS.filter((id) => strategyCount(run, id) > 0).flatMap((id) => {
      const card = DRAFT_CARDS.find((entry) => entry.id === id);
      return card ? [{ id: card.id, title: `${card.title} ×${strategyCount(run, id)}`, impact: card.impact }] : [];
    }),
    tasks,
    modules,
    budget: {
      planned: run.tasks
        .filter((task) => task.status === 'queued' || task === active)
        .reduce((sum, task) => sum + task.work - task.done, 0),
      capacity: remainingBuildCapacity(run),
    },
    segments: SEGMENTS.map((id) => segmentPanel(run, ctx, id, selection, modules)),
    selectedSegment: selection.selectedSegment,
    draft: run.draft
      ? { sprint: run.sprint, summary, news: selection.news ?? null, cards: draftCards(run) }
      : null,
    news: selection.news,
    infrastructure: {
      level: run.infrastructure,
      load: totals.load,
      capacity: totals.capacity,
      utilization: totals.utilization,
      nextCapacity: marketCapacity({ ...ctx, infrastructure: run.infrastructure + 1 }),
      cost: Math.round(infra.cost * infra.cost_growth ** run.infrastructure),
      work: infra.work + infra.work_growth * run.infrastructure,
      progress: infraTask ? infraTask.done / Math.max(1, infraTask.work) : 0,
      status: infraTask?.status,
      taskId: infraTask?.id,
      task: tasks.find(task => task.id === infraTask?.id),
      helpDisabled: Boolean(selection.paused || run.draft || run.energy < 1 || !handy(run, 'build') || (active ?? queued[0])?.id !== infraTask?.id),
      api: infraTask ? apiWorkQuote(run, infraTask.id) ?? undefined : undefined,
      label: infraTask
        ? taskLabel(infraTask.status)
        : L(
            `Расширить · ${money(Math.round(infra.cost * infra.cost_growth ** run.infrastructure))}`,
            `Expand · ${money(Math.round(infra.cost * infra.cost_growth ** run.infrastructure))}`,
          ),
      detail: L(
        `Нагрузка ${whole(totals.load)} / ${whole(totals.capacity)} · расширение ×${dec(MARKET.capacity.expansion_mult)}, +${rate(MARKET.capacity.hosting_per_expansion * hostFactor)}/с · ${infra.work + infra.work_growth * run.infrastructure} работы`,
        `Load ${whole(totals.load)} / ${whole(totals.capacity)} · expansion ×${MARKET.capacity.expansion_mult}, +${rate(MARKET.capacity.hosting_per_expansion * hostFactor)}/s · ${infra.work + infra.work_growth * run.infrastructure} work`,
      ),
      disabled: Boolean(run.over || run.draft || infraTask),
    },
  };
}
