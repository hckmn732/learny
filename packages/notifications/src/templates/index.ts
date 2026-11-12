// Templates of the sixteen notification types (SPEC-209 ET-2, BR-ACC-05, ADR-0010).
//
// One template decides the icon, the title, the body, the internal link and the e-mail template of
// a notification. Every text exists in two variants, `vous` and `tu`; a lexical test guarantees
// that no `tu` variant borrows a vouvoiement. Fixed labels of the interface (`Ouvrir`) are not
// part of these strings and stay in the vouvoiement. The title never exceeds 120 characters and
// the body 400, the bounds of SPEC-109.
import type { NotificationType } from '@learny/contracts';

import type { EmailTemplateKey } from '../../emails/schemas';
import type { Tone } from '../../emails/tone';

export type NotificationData = Record<string, unknown>;

export interface NotificationTemplate {
  icon: string;
  title(data: NotificationData, tone: Tone): string;
  body(data: NotificationData, tone: Tone): string;
  href(data: NotificationData): string;
  emailTemplate: EmailTemplateKey | null;
}

export const TITLE_MAX = 120;
export const BODY_MAX = 400;

/** A bounded, trimmed one-line text: no template can break a SPEC-109 constraint. */
export function clampTitle(value: string): string {
  const text = value.replace(/\s+/gu, ' ').trim();
  if (text.length <= TITLE_MAX) return text;
  return `${text.slice(0, TITLE_MAX - 1).trimEnd()}…`;
}

/** A bounded, trimmed body; line breaks are allowed by SPEC-109 but never start or end it. */
export function clampBody(value: string): string {
  const text = value.replace(/[ \t]+/gu, ' ').trim();
  if (text.length <= BODY_MAX) return text;
  return `${text.slice(0, BODY_MAX - 1).trimEnd()}…`;
}

function text(data: NotificationData, key: string, fallback: string): string {
  const value = data[key];
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function number(data: NotificationData, key: string, fallback: number): number {
  const value = data[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function internalPath(candidate: unknown): string | null {
  if (typeof candidate !== 'string' || !candidate.startsWith('/') || candidate.startsWith('//')) {
    return null;
  }
  if (/[\s\\]/u.test(candidate)) return null;
  return candidate;
}

/** The link of a notification: the producer's internal path, then the formation, then a fallback. */
function hrefOf(data: NotificationData, fallback = '/notifications'): string {
  const explicit = internalPath(data.href);
  if (explicit !== null) return explicit;
  const formationId = data.formationId;
  if (typeof formationId === 'string' && /^[0-9a-f-]{36}$/u.test(formationId)) {
    return `/formations/${formationId}`;
  }
  return fallback;
}

function toneOf(tone: Tone, vous: string, tu: string): string {
  return tone === 'tu' ? tu : vous;
}

function moduleLabel(data: NotificationData): string {
  return text(data, 'moduleTitle', 'le module en cours');
}

function formationLabel(data: NotificationData): string {
  return text(data, 'formationTitle', 'votre formation');
}

function definition(
  icon: string,
  emailTemplate: EmailTemplateKey | null,
  title: (data: NotificationData, tone: Tone) => string,
  body: (data: NotificationData, tone: Tone) => string,
  href: (data: NotificationData) => string = (data) => hrefOf(data),
): NotificationTemplate {
  return {
    icon,
    title: (data, tone) => clampTitle(title(data, tone)),
    body: (data, tone) => clampBody(body(data, tone)),
    href,
    emailTemplate,
  };
}

const formationHref = (data: NotificationData) => hrefOf(data, '/aujourdhui');

export const NOTIFICATION_TEMPLATES: Record<NotificationType, NotificationTemplate> = {
  validation_soon: definition(
    'clock',
    'reminder',
    (_data, tone) =>
      toneOf(tone, 'Votre quiz de validation approche', 'Ton quiz de validation approche'),
    (data, tone) =>
      toneOf(
        tone,
        `« ${moduleLabel(data)} » est planifié ${text(data, 'when', 'bientôt')}. Prévoyez ${String(number(data, 'minutes', 20))} minutes.`,
        `« ${moduleLabel(data)} » est planifié ${text(data, 'when', 'bientôt')}. Compte ${String(number(data, 'minutes', 20))} minutes.`,
      ),
    formationHref,
  ),
  course_ready: definition(
    'book-open',
    'reminder',
    (_data, tone) => toneOf(tone, 'Votre cours est prêt', 'Ton cours est prêt'),
    (data, tone) =>
      toneOf(
        tone,
        `Le cours de « ${moduleLabel(data)} » est disponible. Vous pouvez le lire dès maintenant.`,
        `Le cours de « ${moduleLabel(data)} » est disponible. Tu peux le lire dès maintenant.`,
      ),
    formationHref,
  ),
  global_quiz_today: definition(
    'refresh',
    'reminder',
    (_data, tone) =>
      toneOf(tone, 'Vos révisions du jour sont prêtes', 'Tes révisions du jour sont prêtes'),
    (data, tone) =>
      toneOf(
        tone,
        `${String(number(data, 'notions', 10))} notions à revoir, environ ${String(number(data, 'minutes', 10))} minutes.`,
        `${String(number(data, 'notions', 10))} notions à revoir, environ ${String(number(data, 'minutes', 10))} minutes.`,
      ),
    formationHref,
  ),
  new_gap: definition(
    'alert-triangle',
    'reminder',
    (_data, tone) => toneOf(tone, 'Une lacune a été détectée', 'Une lacune a été repérée'),
    (data, tone) =>
      toneOf(
        tone,
        `« ${text(data, 'notionTitle', 'une notion')} » demande une révision dans « ${formationLabel(data)} ».`,
        `« ${text(data, 'notionTitle', 'une notion')} » demande une révision dans « ${formationLabel(data)} ».`,
      ),
    formationHref,
  ),
  session_planned: definition(
    'calendar',
    'reminder',
    (_data, tone) => toneOf(tone, 'Une séance a été planifiée', 'Une séance est planifiée'),
    (data, tone) =>
      toneOf(
        tone,
        `« ${text(data, 'title', 'Séance de travail')} » est prévue ${text(data, 'when', 'prochainement')}.`,
        `« ${text(data, 'title', 'Séance de travail')} » est prévue ${text(data, 'when', 'prochainement')}.`,
      ),
    (data) => hrefOf(data, '/agenda'),
  ),
  module_validated: definition(
    'check-circle',
    'reminder',
    (_data, tone) => toneOf(tone, 'Module validé', 'Module validé'),
    (data, tone) =>
      toneOf(
        tone,
        `« ${moduleLabel(data)} » est validé. Votre progression est enregistrée.`,
        `« ${moduleLabel(data)} » est validé. Ta progression est enregistrée.`,
      ),
    formationHref,
  ),
  session_to_reschedule: definition(
    'calendar-x',
    'reminder',
    () => 'Une séance à replacer',
    (data, tone) =>
      toneOf(
        tone,
        `« ${text(data, 'title', 'Séance de travail')} » n’a pas eu lieu. Vous pouvez la replacer dans l’agenda.`,
        `« ${text(data, 'title', 'Séance de travail')} » n’a pas eu lieu. Tu peux la replacer dans l’agenda.`,
      ),
    (data) => hrefOf(data, '/agenda'),
  ),
  weekly_review: definition(
    'bar-chart',
    'weekly_review',
    (_data, tone) => toneOf(tone, 'Votre bilan de la semaine', 'Ton bilan de la semaine'),
    (data, tone) =>
      toneOf(
        tone,
        `${text(data, 'studyLabel', 'Votre semaine')} d’étude. Retrouvez les points forts et les notions à consolider.`,
        `${text(data, 'studyLabel', 'Ta semaine')} d’étude. Retrouve les points forts et les notions à consolider.`,
      ),
    formationHref,
  ),
  milestone: definition(
    'award',
    'reminder',
    () => 'Nouveau palier atteint',
    (data, tone) =>
      toneOf(
        tone,
        `${text(data, 'label', 'Un palier')} vient d’être atteint. Votre régularité porte ses fruits.`,
        `${text(data, 'label', 'Un palier')} vient d’être atteint. Ta régularité porte ses fruits.`,
      ),
    formationHref,
  ),
  ai_cost_alert: definition(
    'gauge',
    'reminder',
    (_data, tone) => toneOf(tone, 'Votre plafond IA approche', 'Ton plafond IA approche'),
    (data, tone) =>
      toneOf(
        tone,
        `Vous avez utilisé ${String(number(data, 'percent', 80))} % du plafond quotidien de l’IA fournie.`,
        `Tu as utilisé ${String(number(data, 'percent', 80))} % du plafond quotidien de l’IA fournie.`,
      ),
    (data) => hrefOf(data, '/reglages/ia'),
  ),
  ai_task_failed: definition(
    'alert-circle',
    'ai_task_failed',
    () => 'Une tâche IA a échoué',
    (data, tone) =>
      toneOf(
        tone,
        `« ${text(data, 'taskLabel', 'Une tâche')} » n’a pas abouti. Vous pouvez la relancer.`,
        `« ${text(data, 'taskLabel', 'Une tâche')} » n’a pas abouti. Tu peux la relancer.`,
      ),
    formationHref,
  ),
  export_ready: definition(
    'download',
    null,
    (_data, tone) => toneOf(tone, 'Votre export est prêt', 'Ton export est prêt'),
    (data, tone) =>
      toneOf(
        tone,
        `L’archive de vos données est prête. Le lien reste valable ${String(number(data, 'days', 7))} jours.`,
        `L’archive de tes données est prête. Le lien reste valable ${String(number(data, 'days', 7))} jours.`,
      ),
    (data) => hrefOf(data, '/reglages/donnees'),
  ),
  group_invitation: definition(
    'users',
    'reminder',
    () => 'Invitation à un groupe',
    (data, tone) =>
      toneOf(
        tone,
        `Vous êtes invité à rejoindre « ${text(data, 'groupTitle', 'un groupe')} ».`,
        `Tu es invité à rejoindre « ${text(data, 'groupTitle', 'un groupe')} ».`,
      ),
    (data) => hrefOf(data, '/groupes'),
  ),
  daily_digest: definition(
    'sun',
    'daily_digest',
    (_data, tone) => toneOf(tone, 'Votre programme du jour', 'Ton programme du jour'),
    (data, tone) =>
      toneOf(
        tone,
        `${String(number(data, 'activityCount', 0))} activités prévues${text(data, 'plannedLabel', '') === '' ? '' : `, ${text(data, 'plannedLabel', '')}`}.`,
        `${String(number(data, 'activityCount', 0))} activités prévues${text(data, 'plannedLabel', '') === '' ? '' : `, ${text(data, 'plannedLabel', '')}`}.`,
      ),
    (data) => hrefOf(data, '/aujourdhui'),
  ),
  relaunch: definition(
    'play-circle',
    'reminder',
    (_data, tone) => toneOf(tone, 'Reprenez votre formation', 'Reprends ta formation'),
    (data, tone) =>
      toneOf(
        tone,
        `« ${formationLabel(data)} » vous attend. Une courte séance suffit pour repartir.`,
        `« ${formationLabel(data)} » t’attend. Une courte séance suffit pour repartir.`,
      ),
    formationHref,
  ),
  planning_adjusted: definition(
    'calendar',
    'reminder',
    (_data, tone) => toneOf(tone, 'Votre planning a été ajusté', 'Ton planning a été ajusté'),
    (data, tone) =>
      toneOf(
        tone,
        `Les séances de « ${formationLabel(data)} » ont été réorganisées. Consultez l’agenda.`,
        `Les séances de « ${formationLabel(data)} » ont été réorganisées. Consulte l’agenda.`,
      ),
    (data) => hrefOf(data, '/agenda'),
  ),
};

/** EF-3 — the preference switch a type obeys; `null` means the type is always active. */
export const TYPE_PREFERENCE = {
  global_quiz_today: 'typeRevision',
  validation_soon: 'typeValidation',
  module_validated: 'typeValidation',
  course_ready: 'typeCourse',
  new_gap: 'typeGap',
  session_planned: 'typePlanning',
  session_to_reschedule: 'typePlanning',
  planning_adjusted: 'typePlanning',
  relaunch: 'typeRelaunch',
} as const;

/**
 * ADR-0265 — the channels a type may use. The programme du jour only uses e-mail (EF-6); the
 * export notification only uses the browser, the export e-mail being sent directly by SPEC-211
 * (ET-7). Every other type uses both external channels.
 */
export function channelsOf(
  type: keyof typeof NOTIFICATION_TEMPLATES,
): readonly ('email' | 'push')[] {
  if (type === 'daily_digest') return ['email'];
  if (type === 'export_ready') return ['push'];
  return ['email', 'push'];
}
