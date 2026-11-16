import type {
  AutomationActionItem,
  TutorActivityFeedDto,
  TutorActivityItem,
  TutorCardStatus,
} from '@learny/contracts';
import { toUserZone, type Result } from '@learny/core';

import type { ServiceContext } from './context';

// Home card « Le tuteur a agi pour vous » (SPEC-722, BR-AUT-13, ADR-0190, ADR-0191).
//
// The module keeps the pure projection used by the client and the service facade used by the
// tests and the server. It never duplicates the decisions of SPEC-711: `readTutorActivity`
// receives the `listMyAutomationActions` function as a port, and the three mutations delegate to
// `accept|decline|undo` — the same RLS transactions and the same idempotent answers. The file
// imports no database module so the client bundle only carries the pure helpers.

export const TUTOR_ACTIVITY_CARD_LIMIT = 5;
export const TUTOR_SETTINGS_HREF = '/parametres#automatismes';

const MS_PER_MINUTE = 60_000;

type JournalPage = {
  items: AutomationActionItem[];
  weekCount: number;
  nextCursor: string | null;
};

/** Ports of the engine of SPEC-711; the caller binds the real RLS functions. */
export interface TutorActivityPorts {
  list(
    ctx: ServiceContext,
    query: {
      status: 'pending_consent' | 'applied' | 'consumed';
      limit: number;
      cursor?: string | undefined;
    },
  ): Promise<Result<JournalPage>>;
  accept(
    ctx: ServiceContext,
    input: { actionId: string; choice?: Record<string, unknown> | undefined },
  ): Promise<Result<AutomationActionItem>>;
  decline(ctx: ServiceContext, input: { actionId: string }): Promise<Result<AutomationActionItem>>;
  undo(ctx: ServiceContext, input: { actionId: string }): Promise<Result<AutomationActionItem>>;
}

export interface BuildTutorActivityInput {
  pending?: readonly AutomationActionItem[];
  applied?: readonly AutomationActionItem[];
  consumed?: readonly AutomationActionItem[];
  weekCount?: number;
  limit?: number;
  timeZone?: string;
}

export interface TutorActivityReadInput {
  limit?: number;
  timeZone?: string;
  pendingLimit?: number;
}

function objectOf(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function instantOf(value: string | Date): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

function byNewest(left: AutomationActionItem, right: AutomationActionItem): number {
  const difference = instantOf(right.createdAt) - instantOf(left.createdAt);
  if (difference !== 0) return difference;
  return right.id.localeCompare(left.id);
}

/**
 * EF-2, CL-5 — target of a journal line. A row whose formation was deleted (`formationId` null)
 * keeps its historical explanation but exposes no link, so the card never renders a broken link.
 */
export function tutorActivityHref(
  action: AutomationActionItem,
  timeZone = 'Europe/Paris',
): string | null {
  const formationId = action.formationId;
  if (formationId === null) return null;
  const payload = action.payload;
  switch (action.automation) {
    case 'reprise': {
      const proposed = objectOf(payload.proposed);
      const choice = objectOf(payload.choice);
      const startsAt =
        stringOf(payload.chosenStartsAt) ??
        stringOf(choice?.startsAt) ??
        stringOf(proposed?.startsAt);
      if (startsAt === null) return `/formations/${formationId}/programme`;
      const day = toUserZone(startsAt, timeZone).date;
      return `/agenda?vue=semaine&date=${day}`;
    }
    case 'sprint':
      return '/agenda';
    case 'bilan':
      return `/formations/${formationId}/bilan`;
    case 'micro_seance':
      return `/formations/${formationId}/quiz-global?mode=micro`;
    case 'plafond_quiz':
    case 'jeu_lacune':
    case 'questions_cartes':
      return `/formations/${formationId}/quiz-global`;
    case 'echauffement': {
      const next = objectOf(payload.nextSession);
      const moduleId = stringOf(next?.moduleId) ?? stringOf(payload.moduleId);
      if (moduleId === null) return `/formations/${formationId}/programme`;
      const quiz = stringOf(next?.kind) === 'validation_quiz';
      return `/formations/${formationId}/modules/${moduleId}${quiz ? '/quiz' : ''}`;
    }
    case 'remediation': {
      const moduleId = stringOf(payload.moduleId);
      return moduleId === null
        ? `/formations/${formationId}/programme`
        : `/formations/${formationId}/modules/${moduleId}`;
    }
    case 'pause':
      return TUTOR_SETTINGS_HREF;
    default:
      return `/formations/${formationId}/programme`;
  }
}

/** EF-2 — « Annuler » disappears once the effect was consumed (BR-AUT-11). */
export function canUndoTutorActivity(status: TutorCardStatus): boolean {
  return status === 'applied';
}

/** EF-2 — one card line: dated summary, target, decision still possible. */
export function tutorActivityItem(
  action: AutomationActionItem,
  timeZone = 'Europe/Paris',
): TutorActivityItem {
  const status = action.status as TutorCardStatus;
  return {
    id: action.id,
    automation: action.automation,
    type: action.kind,
    summary: action.summary,
    status,
    requiresConsent: action.requiresConsent,
    createdAt: action.createdAt,
    decidedAt: action.decidedAt,
    href: tutorActivityHref(action, timeZone),
    canUndo: canUndoTutorActivity(status),
  };
}

/**
 * EF-2, EF-3 — applied and consumed lines, newest first. The pending proposals of the automations
 * other than `reprise` stay in the card (ADR-0191 §1); the `reprise` ones belong to the banner.
 */
export function buildTutorActivityFeed(input: BuildTutorActivityInput = {}): TutorActivityFeedDto {
  const timeZone = input.timeZone ?? 'Europe/Paris';
  const limit = Math.max(1, input.limit ?? TUTOR_ACTIVITY_CARD_LIMIT);
  const proposals = [...(input.pending ?? [])]
    .filter((action) => action.status === 'pending_consent' && action.automation !== 'reprise')
    .sort(byNewest)
    .map((action) => tutorActivityItem(action, timeZone));
  const items = [...(input.applied ?? []), ...(input.consumed ?? [])]
    .filter((action) => action.status === 'applied' || action.status === 'consumed')
    .sort(byNewest)
    .slice(0, limit)
    .map((action) => tutorActivityItem(action, timeZone));
  return {
    proposals,
    items,
    weekCount: Math.max(0, input.weekCount ?? 0),
    nextCursor: null,
  };
}

export function encodeTutorActivityCursor(item: TutorActivityItem): string {
  return encodeURIComponent(JSON.stringify({ createdAt: item.createdAt, id: item.id }));
}

export function decodeTutorActivityCursor(
  cursor: string,
): { createdAt: string; id: string } | null {
  try {
    const value: unknown = JSON.parse(decodeURIComponent(cursor));
    const record = objectOf(value);
    const createdAt = stringOf(record?.createdAt);
    const id = stringOf(record?.id);
    return createdAt === null || id === null ? null : { createdAt, id };
  } catch {
    return null;
  }
}

/** ET-3 — stable descending pagination by `(createdAt, id)`; unknown cursors restart at the top. */
export function paginateTutorActivity(
  items: readonly TutorActivityItem[],
  options: { limit?: number; cursor?: string | null } = {},
): { items: TutorActivityItem[]; nextCursor: string | null } {
  const limit = Math.max(1, options.limit ?? TUTOR_ACTIVITY_CARD_LIMIT);
  const sorted = [...items].sort((left, right) => {
    const difference = instantOf(right.createdAt) - instantOf(left.createdAt);
    if (difference !== 0) return difference;
    return right.id.localeCompare(left.id);
  });
  const cursor =
    options.cursor === null || options.cursor === undefined
      ? null
      : decodeTutorActivityCursor(options.cursor);
  const start =
    cursor === null
      ? 0
      : sorted.findIndex((item) => item.createdAt === cursor.createdAt && item.id === cursor.id) +
        1;
  const page = sorted.slice(start < 0 ? 0 : start, (start < 0 ? 0 : start) + limit);
  const last = page[page.length - 1];
  return {
    items: page,
    nextCursor: page.length < limit || last === undefined ? null : encodeTutorActivityCursor(last),
  };
}

/** EF-1, EF-2 — the card and the banner read the same RLS journal through the engine port. */
export async function readTutorActivity(
  ctx: ServiceContext,
  ports: TutorActivityPorts,
  input: TutorActivityReadInput = {},
): Promise<Result<TutorActivityFeedDto>> {
  const limit = Math.max(1, input.limit ?? TUTOR_ACTIVITY_CARD_LIMIT);
  const [applied, consumed, pending] = await Promise.all([
    ports.list(ctx, { status: 'applied', limit }),
    ports.list(ctx, { status: 'consumed', limit }),
    ports.list(ctx, { status: 'pending_consent', limit: input.pendingLimit ?? 20 }),
  ]);
  if (!applied.ok) return applied;
  if (!consumed.ok) return consumed;
  if (!pending.ok) return pending;
  return {
    ok: true,
    value: buildTutorActivityFeed({
      applied: applied.value.items,
      consumed: consumed.value.items,
      pending: pending.value.items,
      weekCount: Math.max(
        applied.value.weekCount,
        consumed.value.weekCount,
        pending.value.weekCount,
      ),
      limit,
      timeZone: input.timeZone ?? 'Europe/Paris',
    }),
  };
}

export interface TutorActivityService {
  read(ctx: ServiceContext, input?: TutorActivityReadInput): Promise<Result<TutorActivityFeedDto>>;
  accept(
    ctx: ServiceContext,
    input: { actionId: string; choice?: Record<string, unknown> | undefined },
  ): Promise<Result<AutomationActionItem>>;
  decline(ctx: ServiceContext, input: { actionId: string }): Promise<Result<AutomationActionItem>>;
  undo(ctx: ServiceContext, input: { actionId: string }): Promise<Result<AutomationActionItem>>;
}

/** ET-1, ET-4 — the mutations are exactly those of SPEC-711, with their RLS and idempotence. */
export function createTutorActivityService(ports: TutorActivityPorts): TutorActivityService {
  return {
    read: (ctx, input = {}) => readTutorActivity(ctx, ports, input),
    accept: (ctx, input) => ports.accept(ctx, input),
    decline: (ctx, input) => ports.decline(ctx, input),
    undo: (ctx, input) => ports.undo(ctx, input),
  };
}

/** EF-2 — a dated label in the learner's zone, e.g. « 11 nov. 08:00 » (client display). */
export function tutorActivityDateLabel(instant: string, timeZone: string): string {
  const date = toUserZone(instant, timeZone);
  const [year = 0, month = 1, day = 1] = date.date.split('-').map(Number);
  const time = date.time;
  return (
    new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day))) + ` ${time}`
  );
}

/** EF-3 — minutes until a future action, rounded up, never negative (deterministic helper). */
export function minutesSinceAction(instant: string, now: string): number {
  return Math.max(0, Math.ceil((instantOf(now) - Date.parse(instant)) / MS_PER_MINUTE));
}
