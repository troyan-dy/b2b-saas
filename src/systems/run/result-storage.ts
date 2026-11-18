import { recordResult, restoreResult, saveMeta, type FinalRun, type Meta } from '../meta/meta';
import type { Run } from './run';
import { clearRunSave } from './save';

/** Keep the playable checkpoint until the result and the player's reward are durable. */
export function finishCompany(run: Run, meta: Meta, persistent: boolean): FinalRun {
  recordResult(run, meta);
  if (persistent) saveMeta(meta);
  return restoreResult(meta)!;
}

export function recoverCompanyResult(meta: Meta, saved: Run | null): FinalRun | null {
  const pending = restoreResult(meta);
  if (pending || !saved?.over) return pending;
  return finishCompany(saved, meta, true);
}

/** A retry resumes the same pending reward after any failed storage operation. */
export function completeCompanyResult(result: FinalRun, meta: Meta, persistent: boolean): boolean {
  if (persistent) {
    if (!saveMeta(meta) || !clearRunSave(result)) return false;
    const finished = { ...meta };
    delete finished.pending;
    if (!saveMeta(finished)) return false;
  }
  delete meta.pending;
  return true;
}
