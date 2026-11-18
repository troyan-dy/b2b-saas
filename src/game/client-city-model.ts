import { L } from '../core/lang';
import { companyContext, customerCount } from '../systems/company/company';
import { SEGMENTS, segmentView, type SegmentId } from '../systems/company/market';
import { clientPay, IDEAS, TUNING, type ClientType, type Run } from '../systems/run/run';
import { PER_S, rate } from '../ui/format';
import { SEGMENT_TITLES } from '../ui/workbench-view';
import { AGENT_SLOTS, CLIENT_SLOTS, STAGE_VIEW, VIEW_AT } from './layout';

const CONTRACT_SEGMENT: Record<ClientType, SegmentId> = {
  small: 'small', startup: 'small', mid: 'medium', corp: 'large', gov: 'large',
};

export const CLIENT_LOOK: Record<ClientType, { height: number; squares: number }> = {
  small: { height: 118, squares: 1 },
  mid: { height: 136, squares: 1 },
  startup: { height: 112, squares: 1 },
  corp: { height: 150, squares: 3 },
  gov: { height: 158, squares: 4 },
};

/** A named customer is shown alongside, and counted separately from, subscribed market cohorts. */
export function cityGroups(run: Run) {
  const ctx = companyContext(run);
  return SEGMENTS.map(id => {
    const segment = segmentView(run.market, ctx, id);
    const contracts = run.clients.filter(client => CONTRACT_SEGMENT[client.type] === id);
    return { id, segment, contracts, count: segment.count + contracts.length };
  }).filter(group => group.count > 0);
}

export function visibleBuildings(count: number, collapsed: boolean): number {
  return collapsed ? 1 : Math.min(4, count);
}

export function cityBuildings(run: Run, groups: ReturnType<typeof cityGroups>, collapsed: boolean) {
  const corporate = [...IDEAS.corp, ...IDEAS.gov];
  return groups.flatMap((group, column) =>
    Array.from({ length: visibleBuildings(group.count, collapsed) }, (_, row) => {
      const [x, y] = CLIENT_SLOTS[column * 4 + row];
      const contract = group.contracts[row];
      const texture = contract?.texture ?? (group.id === 'large' ? corporate[row % corporate.length].texture : run.idea.aud.texture);
      return {
        id: `city:${group.id}:${row}:${contract?.id ?? 'group'}`,
        segment: group.id, texture, x, y,
        title: contract
          ? `${contract.name} · ${rate(clientPay(run, contract) / TUNING.sprint_s)}${PER_S}`
          : L(`${SEGMENT_TITLES[group.id]} компании · потребности и тариф`, `${SEGMENT_TITLES[group.id]} companies · needs and tariff`),
        height: contract ? CLIENT_LOOK[contract.type].height : group.id === 'large' ? 150 : 118,
        chain: contract?.type === 'mid' || (!contract && group.id === 'medium'),
      };
    }),
  );
}

/** Choose the live module furthest towards the city. Ties preserve building order. */
export function cityOutlet(run: Run, occupied: boolean) {
  if (!occupied) return undefined;
  return run.blocks.filter(block => block.live).sort((a, b) => (b.i - b.j) - (a.i - a.j))[0];
}

export function payingGroups(run: Run) {
  return cityGroups(run).map(({ id, segment, contracts }) => ({
    id,
    income: (segment.income + contracts.reduce((sum, client) => sum + clientPay(run, client), 0)) / TUNING.sprint_s,
  })).filter(group => group.income > 0);
}

/** Camera framing expands with the occupied segments, purchased land and the second row of desks. */
export function cityFrame(run: Run) {
  const count = customerCount(run);
  const segments = new Set(run.market.groups.filter(group => group.profiles.some(p => p.count > 0)).map(group => group.id));
  for (const client of run.clients) segments.add(CONTRACT_SEGMENT[client.type]);
  const columns = segments.size;
  const stage = run.stage >= 3 || count > 4 || columns > 1 || run.land > 0 ? 3 : run.stage === 2 || count || run.market.opened ? 2 : 1;
  const rows = run.agents.length > AGENT_SLOTS.length / 2 ? 2 : 1;
  const view = STAGE_VIEW[Math.max(stage, rows === 2 ? 2 : 1) - 1];
  const rightEdge = columns ? CLIENT_SLOTS[(columns - 1) * 4][0] + 105 : 0;
  const x = Math.max(view.x, rightEdge - (1322 - VIEW_AT[0]) / view.zoom);
  const y = rows === 2 ? Math.max(view.y, stage <= 2 ? 300 : 225) : view.y;
  return { key: stage * 10 + rows, columns, rightEdge, x, y, zoom: view.zoom };
}
