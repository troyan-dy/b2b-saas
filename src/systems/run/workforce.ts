import workforce from '../../data/balance/agents.json';
import tuning from '../../data/balance/run.json';
import type { Agent, Run, Tier } from './run';

export const WORKFORCE = workforce;

export function agentWorkRate(run: Run, agent: Agent): number {
  const review = agent.lane === run.review ? tuning.review_boost : 1;
  const slow =
    agent.lane === 'build'
      ? 1 - Math.min(tuning.debt.slow_max, run.debt * tuning.debt.slow_per_point)
      : 1;
  return tuning.tiers[agent.tier].work_per_s * review * slow;
}

export function agentDebtPerWork(run: Run, agent: Agent): number {
  return (
    tuning.tiers[agent.tier].debt_per_work *
    (agent.lane === run.review ? workforce.review_debt_mult : 1) *
    (run.perks.includes('tests') ? workforce.tests_debt_mult : 1)
  );
}

export function agentFixPerWork(tier: Tier): number {
  return tuning.fix_per_work * workforce.fix_multiplier[tier];
}
