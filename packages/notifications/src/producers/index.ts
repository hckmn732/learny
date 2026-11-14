// Producers of the thirteen notification types of BR-NOT-02 (SPEC-706 EF-1 to EF-4, ET-3, ET-4).
//
// A producer is pure: it receives the facts of a domain event (identifiers, bounds and labels
// validated by `@learny/contracts`) and returns the input of the unified service `notify` of
// SPEC-209. Title, body and icon stay in the templates of SPEC-209; this module only decides the
// type, the data of the template, the stable dedupe key, the eligibility instant and the deep
// link. Links are built from the routes of `docs/product/screens.md`, never from a text produced
// by the AI (ET-4).
import { NOTIFICATION_RULES } from '@learny/config';
import {
  NotificationProducerFacts,
  ProducerDedupeKey,
  notificationTypeOf,
  type NotificationProducerFacts as ProducerFacts,
  type NotifyInput,
} from '@learny/contracts';
import { formatUserDate, toUserZone, userLocalDay } from '@learny/core';

const MINUTE_MS = 60_000;

/** BR-NOT-07 — 40 minutes before the planned validation quiz. */
export const VALIDATION_QUIZ_REMINDER_MINUTES = NOTIFICATION_RULES.validationQuizReminderMinutes;

/** EF-2 — the exact eligibility instant of a validation quiz reminder. */
export function validationQuizReminderAt(startsAt: Date | string): Date {
  const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
  if (Number.isNaN(start.getTime())) {
    throw new Error('Instant de quiz invalide.');
  }
  return new Date(start.getTime() - VALIDATION_QUIZ_REMINDER_MINUTES * MINUTE_MS);
}

/**
 * ET-4, EF-2 — the slot and the exact start are part of the key: moving a slot changes the key,
 * so the new reminder is distinct while the old one can be cancelled (CA-2).
 */
export function validationQuizReminderKey(slotId: string, startsAt: Date | string): string {
  const instant = startsAt instanceof Date ? startsAt : new Date(startsAt);
  return ProducerDedupeKey.parse(`validation_soon:${slotId}:${instant.toISOString()}`);
}

function nextCivilDay(day: string): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + 1));
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  return `${pad(next.getUTCFullYear(), 4)}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** « aujourd’hui à 15:00 », « demain à 09:00 » or « le jeudi 12 nov. à 10:00 », profile zone. */
export function localMomentLabel(instant: Date | string, timezone: string, now: Date): string {
  const at = instant instanceof Date ? instant : new Date(instant);
  const zone = toUserZone(at, timezone);
  const today = userLocalDay(now, timezone);
  if (zone.date === today) return `aujourd’hui à ${zone.time}`;
  if (zone.date === nextCivilDay(today)) return `demain à ${zone.time}`;
  return `le ${formatUserDate(at, timezone, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function formationBase(formationId: string | null | undefined): string | null {
  return typeof formationId === 'string' && formationId !== ''
    ? `/formations/${formationId}`
    : null;
}

function courseHref(
  formationId: string | null | undefined,
  moduleId: string | null | undefined,
): string {
  const base = formationBase(formationId);
  if (base !== null && typeof moduleId === 'string' && moduleId !== '') {
    return `${base}/modules/${moduleId}/cours`;
  }
  return base === null ? '/aujourdhui' : `${base}/programme`;
}

function quizHref(
  formationId: string | null | undefined,
  moduleId: string | null | undefined,
): string {
  const base = formationBase(formationId);
  if (base !== null && typeof moduleId === 'string' && moduleId !== '') {
    return `${base}/modules/${moduleId}/quiz`;
  }
  return base === null ? '/agenda' : `${base}/programme`;
}

function programmeHref(formationId: string | null | undefined, last: boolean): string {
  const base = formationBase(formationId);
  if (base === null) return '/aujourdhui';
  return last ? `${base}/bilan` : `${base}/programme`;
}

interface ProducedInput {
  input: NotifyInput;
  /** The local instant of the reminder, kept for the DTO of the job and the demonstration. */
  reminderAt?: Date;
}

/**
 * EF-1 to EF-4, ET-3 — the notification input of one producer. The same facts always produce the
 * same dedupe key, hence at most one in-app notification (CA-1).
 */
export function produceNotificationInput(rawFacts: ProducerFacts, now: Date): ProducedInput {
  const facts = NotificationProducerFacts.parse(rawFacts);
  const type = notificationTypeOf(facts.kind);
  const base = {
    userId: facts.userId,
    ...(facts.formationId === undefined || facts.formationId === null
      ? {}
      : { formationId: facts.formationId }),
  };

  switch (facts.kind) {
    case 'validation_quiz_reminder': {
      const startsAt = new Date(facts.startsAt);
      const reminderAt = validationQuizReminderAt(startsAt);
      const href = quizHref(facts.formationId, facts.moduleId);
      return {
        reminderAt,
        input: {
          ...base,
          type,
          data: {
            moduleTitle: facts.moduleTitle ?? 'le module en cours',
            when: localMomentLabel(startsAt, facts.timezone, now),
            minutes: facts.minutes ?? 20,
            href,
          },
          dedupeKey: validationQuizReminderKey(facts.slotId, startsAt),
          eligibleAt: reminderAt.toISOString(),
          // BR-NOT-06, CL-5 — after the quiz starts a reminder is meaningless: a deferred send is
          // abandoned instead of arriving late.
          staleAt: startsAt.toISOString(),
        },
      };
    }
    case 'course_ready':
      return {
        input: {
          ...base,
          type,
          data: {
            moduleTitle: facts.moduleTitle ?? 'le module en cours',
            href: courseHref(facts.formationId, facts.moduleId),
          },
          dedupeKey: ProducerDedupeKey.parse(
            facts.version === undefined
              ? `course_ready:${facts.courseId}`
              : `course_ready:${facts.courseId}:${String(facts.version)}`,
          ),
        },
      };
    case 'global_quiz_today':
      return {
        input: {
          ...base,
          type,
          data: {
            notions: facts.notions,
            minutes: facts.minutes,
            href:
              facts.formationId === undefined || facts.formationId === null
                ? '/aujourdhui'
                : `/formations/${facts.formationId}/quiz-global`,
          },
          dedupeKey: ProducerDedupeKey.parse(`global_quiz_today:${facts.localDay}`),
        },
      };
    case 'new_gap':
      return {
        input: {
          ...base,
          type,
          data: {
            notionTitle: facts.notionTitle,
            ...(facts.formationTitle === undefined ? {} : { formationTitle: facts.formationTitle }),
            href:
              facts.formationId === undefined || facts.formationId === null
                ? '/aujourdhui'
                : `/formations/${facts.formationId}/lacunes`,
          },
          dedupeKey: ProducerDedupeKey.parse(`new_gap:${facts.gapId}`),
        },
      };
    case 'session_planned':
      return {
        input: {
          ...base,
          type,
          data: {
            title: facts.title,
            when: localMomentLabel(facts.startsAt, facts.timezone, now),
            href: '/agenda',
          },
          dedupeKey: ProducerDedupeKey.parse(`session_planned:${facts.slotId}`),
        },
      };
    case 'module_validated':
      return {
        input: {
          ...base,
          type,
          data: {
            modulePosition: facts.modulePosition,
            moduleTitle: facts.moduleTitle,
            score: facts.score,
            ...(facts.nextModulePosition === undefined
              ? {}
              : { nextModulePosition: facts.nextModulePosition }),
            ...(facts.nextModuleTitle === undefined
              ? {}
              : { nextModuleTitle: facts.nextModuleTitle }),
            ...(facts.isLastModule === undefined ? {} : { isLastModule: facts.isLastModule }),
            href: programmeHref(facts.formationId, facts.isLastModule === true),
          },
          dedupeKey: ProducerDedupeKey.parse(`module_validated:${facts.moduleId}`),
        },
      };
    case 'session_to_reschedule':
      return {
        input: {
          ...base,
          type,
          data: { title: facts.title, href: '/agenda' },
          dedupeKey: ProducerDedupeKey.parse(`session_to_reschedule:${facts.slotId}`),
        },
      };
    case 'weekly_review':
      return {
        input: {
          ...base,
          type,
          data: {
            studyLabel: facts.studyLabel ?? 'Votre semaine',
            href: '/accueil#bilan',
          },
          dedupeKey: ProducerDedupeKey.parse(`weekly_review:${facts.weekStart}`),
        },
      };
    case 'milestone':
      return {
        input: {
          ...base,
          type,
          data: { label: facts.label, href: '/accueil' },
          dedupeKey: ProducerDedupeKey.parse(`milestone:${facts.milestoneId}`),
        },
      };
    case 'ai_cost_alert':
      return {
        input: {
          ...base,
          type,
          data: { percent: facts.percent, href: '/parametres#modeles' },
          dedupeKey: ProducerDedupeKey.parse(`ai_cost_alert:${facts.localDay}`),
        },
      };
    case 'ai_task_failed':
      return {
        input: {
          ...base,
          type,
          data: {
            taskLabel: facts.taskLabel,
            ...(facts.modelLabel === undefined ? {} : { modelLabel: facts.modelLabel }),
            href: '/parametres#modeles',
          },
          dedupeKey: ProducerDedupeKey.parse(`ai_task_failed:${facts.taskId}`),
        },
      };
    case 'export_ready':
      return {
        input: {
          ...base,
          type,
          data: { days: facts.days ?? 7, href: '/parametres#profil' },
          dedupeKey: ProducerDedupeKey.parse(`export_ready:${facts.exportId}`),
        },
      };
    case 'group_invitation':
      return {
        input: {
          ...base,
          type,
          data: {
            groupTitle: facts.groupTitle,
            href:
              facts.formationId === undefined || facts.formationId === null
                ? '/accueil'
                : `/formations/${facts.formationId}/groupe`,
          },
          dedupeKey: ProducerDedupeKey.parse(
            `group_invitation:${facts.groupId}:${facts.invitedUserId}`,
          ),
        },
      };
  }
}

/** EF-2, CA-2 — the schedule of a reminder, computed with the profile zone (BR-ACC-07). */
export function validationQuizReminderSchedule(
  slotId: string,
  startsAt: string,
  timezone: string,
): { eligibleAt: Date; localTime: string; localDay: string; dedupeKey: string } {
  const start = new Date(startsAt);
  const eligibleAt = validationQuizReminderAt(start);
  const zone = toUserZone(start, timezone);
  return {
    eligibleAt,
    localTime: zone.time,
    localDay: zone.date,
    dedupeKey: validationQuizReminderKey(slotId, start),
  };
}
