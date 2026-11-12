// E-mail side of a notification (SPEC-209 EF-2, EF-6, ET-7). A notification type maps to one of the
// SPEC-204 service templates: `reminder` for the ordinary messages, `weekly_review` and
// `ai_task_failed` for their own, `daily_digest` for the programme du jour. `export_ready` has no
// e-mail: SPEC-211 sends the export message itself (ET-7).
import type { NotificationType } from '@learny/contracts';

import type { EmailProps, EmailTemplateKey } from '../../emails/schemas';

import type { NotificationData, NotificationTemplate } from './index';

export interface EmailContent {
  template: EmailTemplateKey;
  props: EmailProps<EmailTemplateKey>;
}

function text(data: NotificationData, key: string, fallback: string): string {
  const value = data[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

function count(data: NotificationData, key: string, fallback: number): number {
  const value = data[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function activitiesOf(data: NotificationData): EmailProps<'daily_digest'>['activities'] {
  const value = data.activities;
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null && !Array.isArray(item),
    )
    .map((item) => ({
      time: text(item, 'time', '00:00'),
      title: text(item, 'title', 'Activité'),
      detail: text(item, 'detail', ''),
      formationTitle: text(item, 'formationTitle', ''),
    }))
    .slice(0, 20);
}

function heldOf(data: NotificationData): EmailProps<'daily_digest'>['held'] {
  const value = data.held;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const held = value as Record<string, unknown>;
  const heldCount = count(held, 'count', 0);
  if (heldCount <= 0) return null;
  const maxPerDay = count(held, 'maxPerDay', 5);
  const titles = Array.isArray(held.titles)
    ? held.titles.filter((title): title is string => typeof title === 'string').slice(0, 10)
    : [];
  return {
    count: heldCount,
    maxPerDay: maxPerDay === 3 || maxPerDay === 8 ? maxPerDay : 5,
    titles,
  };
}

/**
 * Builds the e-mail of a notification. `title`, `body` and `href` are the already-rendered strings
 * of the in-app row, so the mail and the inbox never diverge (BR-NOT-03).
 */
export function buildEmailContent(
  type: NotificationType,
  template: NotificationTemplate,
  data: NotificationData,
  rendered: { title: string; body: string; href: string },
  firstName: string | null,
): EmailContent | null {
  if (template.emailTemplate === null) return null;
  const formationTitle =
    typeof data.formationTitle === 'string' && data.formationTitle.trim() !== ''
      ? data.formationTitle.trim()
      : null;

  switch (template.emailTemplate) {
    case 'daily_digest':
      return {
        template: 'daily_digest',
        props: {
          firstName,
          dateLabel: text(data, 'dateLabel', 'aujourd’hui'),
          plannedLabel: text(data, 'plannedLabel', ''),
          activities: activitiesOf(data),
          globalQuiz:
            typeof data.globalQuiz === 'object' && data.globalQuiz !== null
              ? (data.globalQuiz as EmailProps<'daily_digest'>['globalQuiz'])
              : null,
          held: heldOf(data),
        },
      };
    case 'weekly_review':
      return {
        template: 'weekly_review',
        props: {
          periodStartLabel: text(data, 'periodStartLabel', 'cette semaine'),
          periodEndLabel: text(data, 'periodEndLabel', 'aujourd’hui'),
          studyLabel: text(data, 'studyLabel', '0 h'),
          retentionPercent:
            typeof data.retentionPercent === 'number' ? data.retentionPercent : null,
          atRiskCount: count(data, 'atRiskCount', 0),
          succeeded: text(data, 'succeeded', 'Vos acquis progressent.'),
          atRisk: text(data, 'atRisk', 'Aucune notion à risque.'),
          nextWeek: text(data, 'nextWeek', 'La prochaine semaine est planifiée.'),
        },
      };
    case 'ai_task_failed':
      return {
        template: 'ai_task_failed',
        props: {
          taskLabel: text(data, 'taskLabel', 'Une tâche IA'),
          modelLabel: text(data, 'modelLabel', 'modèle personnel'),
          subject: text(data, 'subject', rendered.title).slice(0, 120),
          managedAvailable: data.managedAvailable === true,
        },
      };
    case 'reminder':
    default:
      return {
        template: 'reminder',
        props: {
          title: rendered.title,
          body: rendered.body,
          href: rendered.href,
          ctaLabel: 'Ouvrir',
          formationTitle,
        },
      };
  }
}
