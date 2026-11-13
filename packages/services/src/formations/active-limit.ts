// Business guard of the three-active-formations limit (SPEC-618 EF-3, ET-3; BR-FOR-10,
// ADR-0016). The functions are pure so the limit, the transition table and the fallback of the
// current formation are testable without a database; the services call them inside the user
// advisory lock that serializes concurrent pauses, resumes and archives.

import { FORMATION_RULES } from '@learny/config/product';

/** BR-FOR-10 — a learner never has more than three active formations. */
export const MAX_ACTIVE_FORMATIONS = FORMATION_RULES.maxActiveFormations;

export type FormationAction = 'pause' | 'resume' | 'archive';

export type ManagedStatus =
  'cadrage' | 'programme_proposed' | 'active' | 'paused' | 'completed' | 'archived';

export interface TransitionDecision {
  /** `applied` changes the status; `unchanged` is the idempotent replay of the same action. */
  readonly outcome: 'applied' | 'unchanged';
  readonly nextStatus: ManagedStatus;
}

/**
 * EF-2/EF-3/CL-2 — the only accepted transitions. Pausing a paused formation, resuming an active
 * one and archiving an archived one are idempotent no-ops; every other source status is refused.
 */
export function transitionFor(
  status: ManagedStatus,
  action: FormationAction,
): TransitionDecision | null {
  switch (action) {
    case 'pause':
      if (status === 'active') return { outcome: 'applied', nextStatus: 'paused' };
      if (status === 'paused') return { outcome: 'unchanged', nextStatus: 'paused' };
      return null;
    case 'resume':
      if (status === 'paused') return { outcome: 'applied', nextStatus: 'active' };
      if (status === 'active') return { outcome: 'unchanged', nextStatus: 'active' };
      return null;
    case 'archive':
      if (status === 'active' || status === 'paused') {
        return { outcome: 'applied', nextStatus: 'archived' };
      }
      if (status === 'archived') return { outcome: 'unchanged', nextStatus: 'archived' };
      return null;
  }
}

export type ActiveLimitDecision = 'allowed' | 'allowed-with-pause' | 'requires-pause';

/**
 * EF-3, ET-3 — decision for a resume of a paused formation that is not counted yet. `activeCount`
 * excludes the resumed formation. A chosen formation to pause makes the transition possible even
 * when the limit is already reached; otherwise the dialog is required.
 */
export function activeLimitDecision(
  activeCount: number,
  pauseFormationId: string | null | undefined,
): ActiveLimitDecision {
  if (activeCount < MAX_ACTIVE_FORMATIONS) return 'allowed';
  return pauseFormationId === null || pauseFormationId === undefined
    ? 'requires-pause'
    : 'allowed-with-pause';
}

export interface CurrentCandidate {
  readonly formationId: string;
  readonly lastOpenedAt: string | null;
  readonly createdAt: string;
}

/**
 * CL-5 — after a pause or an archive of the current formation, the current one is the last
 * active formation consulted (`last_opened_at`), then the most recently created active one.
 * Returns null when no active formation remains.
 */
export function nextCurrentFormation(
  candidates: readonly CurrentCandidate[],
  removedFormationId: string,
): string | null {
  const remaining = candidates.filter((candidate) => candidate.formationId !== removedFormationId);
  if (remaining.length === 0) return null;
  const sorted = [...remaining].sort((left, right) => {
    const leftKey = left.lastOpenedAt ?? left.createdAt;
    const rightKey = right.lastOpenedAt ?? right.createdAt;
    if (leftKey === rightKey) return left.formationId < right.formationId ? 1 : -1;
    return leftKey < rightKey ? 1 : -1;
  });
  return sorted[0]?.formationId ?? null;
}

/** EF-3 — the dialog offers every currently active formation and nothing else. */
export function activeFormationsForLimit<T extends { readonly status: string }>(
  formations: readonly T[],
): T[] {
  return formations.filter((formation) => formation.status === 'active');
}
