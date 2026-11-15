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
import { blockEffects, PRODUCTION, STRATEGY_IDS, strategyCount } from '../systems/run/product';
import { activeWork, apiWorkQuote, remainingBuildCapacity } from '../systems/run/production';
import {
  cellsMax,
  agentWorkRate,
  agentDebtPerWork,
  agentFixPerWork,
  busy,
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
import { dec, money, PER_S, rate, whole } from './format';
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
      `${names[key] ?? key} ${key === 'seats' || key === 'patience' ? '+' : '×'}${dec(Number(value.toFixed(2)))}`,
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
  const demand = run.market.groups
    .map((group) => {
      const count = group.profiles
        .filter((profile) =>
          profile.needs.some((need) => need.block === kind && need.level > level),
        )
        .reduce((sum, profile) => sum + profile.count, 0);
      return count ? `${SEGMENT_TITLES[group.id]} ${whole(count)}` : '';
    })
    .filter(Boolean);
  const contracts = run.clients.filter(
    (client) =>
      !client.happy &&
      client.want === kind &&
      client.wantLevel > level &&
      (client.promised || client.wantLevel > 1 || run.known.includes(kind)),
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
  const premiumShare = run.market.groups
    .find((group) => group.id === 'large')!
    .profiles.filter(
      (profile) => profile.connection?.includes('crm') && profile.connection.includes('bot'),
    )
    .reduce((sum, profile) => sum + profile.share, 0);
  if (premiumShare && (kind === 'crm' || kind === 'bot'))
    result.push(
      L(
        `CRM v2 рядом с поддержкой v2: запрос ${premiumShare}% крупных`,
        `CRM v2 next to support v2: request of ${premiumShare}% of large companies`,
      ),
    );
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
  const canPlace = shelf(run).includes(kind) && run.blocks.length < cellsMax(run);
  const maxed = liveLevel >= PRODUCTION.max_level;
  let label: string | undefined;
  if (planned) label = taskLabel(planned.status);
  else if (!liveLevel && !canPlace)
    label =
      run.blocks.length >= cellsMax(run)
        ? L('Нет клетки', 'No free cell')
        : RULES[kind].stage > run.stage
          ? L(`Этап ${RULES[kind].stage}`, `Stage ${RULES[kind].stage}`)
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
        ? L('Обёртка Клода', 'Claude wrapper')
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
      work * (liveLevel ? PRODUCTION.upgrade_cost_per_work : PRODUCTION.construction_cost_per_work),
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
    const preview = segmentView(
      run.market,
      { ...ctx, levels: { ...ctx.levels, [need.block]: target } },
      id,
    );
    const before = segmentView(run.market, ctx, id);
    const connection = run.market.groups
      .find((group) => group.id === id)!
      .profiles.find(
        (profile) =>
          profile.connection && profile.needs.some((entry) => entry.block === need.block),
      )?.connection;
    const extra = connection
      ? L(
          ` · связь ${connection.map(shortName).join(' + ')}: ${ctx.links.some((pair) => connection.every((block) => pair.includes(block))) ? 'работает' : 'нужна'}`,
          ` · link ${connection.map(shortName).join(' + ')}: ${ctx.links.some((pair) => connection.every((block) => pair.includes(block))) ? 'active' : 'needed'}`,
        )
      : '';
    return {
      block: need.block,
      title: `${blockName(need.block)} v${need.level}`,
      count: need.count,
      share: need.share,
      effect: need.fulfilled
        ? L(`Уровень выпущен${extra}`, `Level shipped${extra}`)
        : L(
            `Шаг v${target}: удовлетворённость ${before.satisfaction} → ${preview.satisfaction}; интерес рынка ${whole(need.potential)}${extra}`,
            `Step v${target}: satisfaction ${before.satisfaction} → ${preview.satisfaction}; market interest ${whole(need.potential)}${extra}`,
          ),
      action: need.fulfilled ? 'none' : (module?.action ?? 'none'),
      disabled: need.fulfilled || !module || module.disabled,
      actionLabel: !need.fulfilled
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
  const labels: Record<string, string> = {
    needs: L('потребности', 'needs'),
    price: L('цена', 'price'),
    overload: L('перегруз', 'overload'),
    outage: L('сбой', 'outage'),
    delay: L('задержка', 'delay'),
    debt: L('техдолг', 'debt'),
  };
  const contracts = run.clients
    .filter((client) => contractSegment(client) === id)
    .map((client) => ({
      title: `${client.name} · ${rate(clientPay(run, client) / TUNING.sprint_s)}${PER_S}`,
      detail: client.happy
        ? L('Доволен · отдельный фиксированный тариф', 'Happy · separate fixed tariff')
        : !client.promised && client.wantLevel <= 1 && !run.known.includes(client.want)
          ? L(
              `Ждёт молча · ${client.patience} спр. · разведка откроет запрос`,
              `Waiting silently · ${client.patience} sprints · research reveals the request`,
            )
          : L(
              `${client.promised ? 'Обещано' : 'Ждёт'} ${shortName(client.want)} v${client.wantLevel} · ${client.patience} спр. · тариф отдельный`,
              `${client.promised ? 'Promised' : 'Waiting for'} ${shortName(client.want)} v${client.wantLevel} · ${client.patience} sprints · separate tariff`,
            ),
    }));
  return {
    id,
    title: SEGMENT_TITLES[id],
    count: segment.count + contracts.length,
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
      `Ожидаемый доход ${rate(forecast.before.income / TUNING.sprint_s)} → ${rate(forecast.income / TUNING.sprint_s)}/с; могут уйти ≈${forecast.lost}. Без учёта новых клиентов.`,
      `Expected income ${rate(forecast.before.income / TUNING.sprint_s)} → ${rate(forecast.income / TUNING.sprint_s)}/s; ≈${forecast.lost} may leave. Excludes new customers.`,
    ),
    needs: segmentNeeds(run, ctx, id, modules),
    reasons: Object.entries(segment.reasons)
      .filter(([, value]) => value >= 0.5)
      .map(([key, value]) => `${key === 'needs' ? '+' : '−'}${Math.round(value)} ${labels[key]}`),
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
  const allowed = new Set(['core', 'landing', 'pay', ...run.pool]);
  const modules = Object.keys(RULES)
    .filter((kind) => allowed.has(kind))
    .map((kind) => moduleView(run, kind, selection.picked, hostFactor));
  const queued = run.tasks.filter((task) => task.status === 'queued');
  const tasks = run.tasks.map((task) => taskView(run, task, queued.indexOf(task), queued));
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
