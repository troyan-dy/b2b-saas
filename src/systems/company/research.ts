import data from '../../data/balance/research.json';
import {
  acceptedPrice,
  priceForecast,
  SEGMENTS,
  segmentView,
  type MarketContext,
  type MarketState,
  type SegmentId,
  type SegmentView,
} from './market';

export const RESEARCH = data;
export type ResearchKind = 'clients' | 'market';
export interface ResearchFinding {
  type: 'need' | 'retention' | 'price' | 'opportunity' | 'competition';
  segment: SegmentId;
  value: number;
  block?: string;
  level?: number;
}
export interface ResearchForecast {
  id: SegmentId;
  price: number;
  lost: number;
  income: number;
  satisfaction: number;
}
export interface ResearchReport {
  kind: ResearchKind;
  sprint: number;
  revision: number;
  segments: SegmentView[];
  forecasts: ResearchForecast[];
  findings: ResearchFinding[];
}
export interface ResearchState {
  active: ResearchKind | null;
  progress: Record<ResearchKind, number>;
  reports: Record<ResearchKind, ResearchReport | null>;
  history: ResearchReport[];
}

export function createResearch(): ResearchState {
  return {
    active: null,
    progress: { clients: 0, market: 0 },
    reports: { clients: null, market: null },
    history: [],
  };
}

export function researchAvailable(
  state: ResearchState,
  kind: ResearchKind,
  market: MarketState,
): boolean {
  return state.reports[kind]?.revision !== (market.revision ?? 0);
}

export function beginResearch(
  state: ResearchState,
  kind: ResearchKind,
  market: MarketState,
): boolean {
  if (!researchAvailable(state, kind, market)) return false;
  state.active = kind;
  return true;
}

function clientFindings(segments: SegmentView[]): ResearchFinding[] {
  return segments.map((segment) => {
    const need = segment.needs
      .filter((item) => !item.fulfilled)
      .sort((a, b) => b.count - a.count || b.share - a.share)[0];
    return need
      ? {
          type: 'need',
          segment: segment.id,
          block: need.block,
          level: need.level,
          value: need.share,
        }
      : { type: 'retention', segment: segment.id, value: segment.satisfaction };
  });
}

function marketFindings(
  market: MarketState,
  ctx: MarketContext,
  segments: SegmentView[],
): ResearchFinding[] {
  const opportunity = [...segments].sort(
    (a, b) => (b.market - b.count) * b.unitPrice - (a.market - a.count) * a.unitPrice,
  )[0];
  const pressured = [...market.groups].sort((a, b) => (a.demand ?? 1) - (b.demand ?? 1))[0];
  const group = market.groups.find((item) => item.id === opportunity.id)!;
  const comfort = group.profiles.reduce(
    (sum, profile) => sum + (acceptedPrice(profile, group.id, ctx) * profile.share) / 100,
    0,
  );
  return [
    {
      type: 'opportunity',
      segment: opportunity.id,
      value: Math.max(0, opportunity.market - opportunity.count),
    },
    { type: 'price', segment: opportunity.id, value: comfort },
    { type: 'competition', segment: pressured.id, value: pressured.demand ?? 1 },
  ];
}

function snapshot(
  kind: ResearchKind,
  market: MarketState,
  ctx: MarketContext,
  sprint: number,
): ResearchReport {
  const segments = SEGMENTS.map((id) => segmentView(market, ctx, id));
  const forecasts =
    kind === 'market'
      ? SEGMENTS.flatMap((id) =>
          data.forecast_prices.map((price) => {
            const forecast = priceForecast(market, ctx, id, price);
            return {
              id,
              price,
              lost: forecast.lost,
              income: forecast.income,
              satisfaction: forecast.after.satisfaction,
            };
          }),
        )
      : [];
  return structuredClone({
    kind,
    sprint,
    revision: market.revision ?? 0,
    segments,
    forecasts,
    findings: (kind === 'clients'
      ? clientFindings(segments)
      : marketFindings(market, ctx, segments)
    ).slice(0, data.finding_limit),
  });
}

/** The caller pays only for active work; finishing returns a detached, dated observation. */
export function advanceResearch(
  state: ResearchState,
  work: number,
  market: MarketState,
  ctx: MarketContext,
  sprint: number,
): ResearchReport | null {
  const kind = state.active;
  if (!kind || !Number.isFinite(work) || work <= 0) return null;
  if (!researchAvailable(state, kind, market)) {
    state.active = null;
    return null;
  }
  state.progress[kind] = Math.min(data.work[kind], state.progress[kind] + work);
  if (state.progress[kind] < data.work[kind]) return null;
  const report = snapshot(kind, market, ctx, sprint);
  state.reports[kind] = report;
  state.history.push(structuredClone(report));
  if (state.history.length > data.history_limit)
    state.history.splice(0, state.history.length - data.history_limit);
  state.progress[kind] = 0;
  state.active = null;
  return report;
}
