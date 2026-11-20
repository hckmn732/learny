import {
  automationDisplayDefinition,
  type AutomationActionItem,
  type TutorActivityFeedDto,
  type TutorActivityItem,
  type TutorCardStatus,
} from '@learny/contracts';
import { toUserZone } from '@learny/core';

export const TUTOR_SETTINGS_HREF = '/parametres#automatismes';
const TUTOR_ACTIVITY_CARD_LIMIT = 5;

type BuildInput = {
  pending?: readonly AutomationActionItem[];
  applied?: readonly AutomationActionItem[];
  consumed?: readonly AutomationActionItem[];
  weekCount?: number;
  limit?: number;
  timeZone?: string;
};

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
  return difference !== 0 ? difference : right.id.localeCompare(left.id);
}

function tutorActivityHref(action: AutomationActionItem, timeZone: string): string | null {
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
      return `/agenda?vue=semaine&date=${toUserZone(startsAt, timeZone).date}`;
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

function tutorActivityItem(action: AutomationActionItem, timeZone: string): TutorActivityItem {
  const status = action.status as TutorCardStatus;
  const summary =
    status === 'consumed' &&
    action.automation === 'micro_seance' &&
    typeof action.payload.cardSummary === 'string'
      ? action.payload.cardSummary
      : action.summary;
  return {
    id: action.id,
    automation: action.automation,
    type: action.kind,
    summary,
    status,
    requiresConsent: action.requiresConsent,
    createdAt: action.createdAt,
    decidedAt: action.decidedAt,
    href: tutorActivityHref(action, timeZone),
    canUndo:
      action.status === 'applied' &&
      action.undoPayload !== null &&
      automationDisplayDefinition(action.automation)?.canUndo !== false,
  };
}

export function buildTutorActivityFeed(input: BuildInput = {}): TutorActivityFeedDto {
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

export function tutorActivityDateLabel(instant: string, timeZone: string): string {
  const date = toUserZone(instant, timeZone);
  const [year = 0, month = 1, day = 1] = date.date.split('-').map(Number);
  return (
    new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day))) + ` ${date.time}`
  );
}
