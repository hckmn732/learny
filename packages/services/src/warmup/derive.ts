// Pure derivations of the daily warm-up (SPEC-714 EF-2 to EF-7). The services pass the learner's
// instant and IANA zone explicitly: nothing here reads the process clock or the machine zone
// (ADR-0047, ADR-0030). The functions are unit-tested with the frozen instant of the mockup.
import { z } from 'zod';

import type { WarmupSessionKind, WarmupStatus } from '@learny/contracts';
import { toInstant, zonedParts } from '@learny/core';

const MS_PER_MINUTE = 60_000;
const WARMUP_LEAD_MINUTES = 10;
const SECONDS_PER_QUESTION = 40;

export type WarmupScope = 'yesterday_prerequisites' | 'yesterday';

const pad = (value: number): string => String(value).padStart(2, '0');

/** EF-4 — `ceil(count × 40 s / 60)` minutes, at least 2 (2 or 3 questions → 2, 5 → 4). */
export function warmupDurationMin(count: number): number {
  return Math.max(2, Math.ceil((count * SECONDS_PER_QUESTION) / 60));
}

/** EF-4 — the warm-up starts 10 minutes before the upcoming session and lasts its own minutes. */
export function warmupSlotWindow(
  sessionStartsAt: Date | string,
  count: number,
): { startsAt: Date; endsAt: Date } {
  const startsAt = new Date(
    toInstant(sessionStartsAt).getTime() - WARMUP_LEAD_MINUTES * MS_PER_MINUTE,
  );
  const endsAt = new Date(startsAt.getTime() + warmupDurationMin(count) * MS_PER_MINUTE);
  return { startsAt, endsAt };
}

/** EF-6 — the meta line of « Votre journée ». */
export function warmupMeta(count: number, durationMin: number): string {
  return `${String(count)} questions de rappel · ${String(durationMin)} min · ajouté par le tuteur`;
}

/** EF-7 — noun used in the card title and in the explanations. */
export function sessionKindLabel(kind: WarmupSessionKind): string {
  switch (kind) {
    case 'validation_quiz':
      return 'quiz';
    case 'course':
      return 'cours';
    case 'exercise':
      return 'exercice';
    case 'mock_exam':
      return 'examen blanc';
    case 'contributions':
      return 'séance d’apports';
    default:
      return 'séance';
  }
}

/** EF-7 — `Échauffement · avant votre quiz de 14:00` (fixed vouvoiement, BR-ACC-05). */
export function warmupTitle(kind: WarmupSessionKind, time: string): string {
  return `Échauffement · avant votre ${sessionKindLabel(kind)} de ${time}`;
}

/** EF-7 — `3 questions de rappel, 2 minutes : la veille et les prérequis du chapitre.` */
export function warmupSubtitle(count: number, durationMin: number, scope: WarmupScope): string {
  const questions = `${String(count)} question${count === 1 ? '' : 's'} de rappel`;
  const minutes = `${String(durationMin)} minute${durationMin === 1 ? '' : 's'}`;
  const scopeText =
    scope === 'yesterday'
      ? 'les notions vues la veille.'
      : 'la veille et les prérequis du chapitre.';
  return `${questions}, ${minutes} : ${scopeText}`;
}

/** EF-7 — `Question 1 sur 3`, then `Terminé` once the first pass is over. */
export function warmupProgress(index: number, count: number): string {
  return index < count ? `Question ${String(index + 1)} sur ${String(count)}` : 'Terminé';
}

/** EF-7 — `Échauffement fait : 2 sur 3`. */
export function warmupScore(knewCount: number, count: number): string {
  return `Échauffement fait : ${String(knewCount)} sur ${String(count)}`;
}

/** EF-7, CL-8 — the follow-up sentence of the finished card. */
export function warmupFollowText(input: {
  reviewQuestions: readonly string[];
  kind: WarmupSessionKind;
  tonight: boolean;
}): string {
  if (input.reviewQuestions.length === 0) {
    return input.kind === 'validation_quiz'
      ? 'Tout est là. Vous êtes prêt pour le quiz de validation.'
      : 'Tout est là. Vous êtes prêt pour la suite.';
  }
  const quoted = input.reviewQuestions
    .map((question) => `« ${trimQuestion(question)} »`)
    .join(', ');
  const subject =
    input.reviewQuestions.length > 1 ? 'Ces notions repassent' : 'Cette notion repasse';
  const moment = input.tonight
    ? 'dans le quiz global de ce soir.'
    : 'dans le prochain quiz global.';
  return `À revoir : ${quoted}. ${subject} ${moment}`;
}

/** The mockup quotes the question without its final question mark. */
export function trimQuestion(question: string): string {
  return question.trim().replace(/ \?$/, '');
}

/** EF-7 — label of the main button that follows the card. */
export function warmupNextLabel(kind: WarmupSessionKind): string {
  switch (kind) {
    case 'validation_quiz':
      return 'Passer au quiz de validation';
    case 'course':
      return 'Ouvrir le cours';
    case 'exercise':
      return 'Ouvrir l’exercice';
    case 'mock_exam':
      return 'Commencer l’examen blanc';
    case 'contributions':
      return 'Ouvrir le module';
    default:
      return 'Continuer';
  }
}

/** EF-7 — destination of the main button, from the identifiers of the upcoming session. */
export function nextSessionHref(input: {
  kind: WarmupSessionKind;
  formationId: string;
  moduleId: string | null;
  activityId: string | null;
}): string {
  const formation = `/formations/${input.formationId}`;
  const module = input.moduleId === null ? null : `${formation}/modules/${input.moduleId}`;
  switch (input.kind) {
    case 'validation_quiz':
      return module === null ? `${formation}/quiz-global` : `${module}/quiz`;
    case 'course':
      return module === null ? `${formation}/programme` : `${module}/cours`;
    case 'exercise':
      if (module === null) return `${formation}/programme`;
      return input.activityId === null
        ? `${module}/exercices`
        : `${module}/exercices/${input.activityId}`;
    case 'mock_exam':
      return `${formation}/examen-blanc`;
    case 'contributions':
      return module ?? `${formation}/programme`;
    default:
      return `${formation}/programme`;
  }
}

/** EF-7 — status of the card from the recorded first-pass answers. */
export function warmupStatus(input: {
  itemCount: number;
  answerCount: number;
  attemptStatus: string | null;
  submitted: boolean;
}): WarmupStatus {
  if (input.submitted) return 'done';
  if (input.itemCount > 0 && input.answerCount >= input.itemCount) return 'done';
  if (input.answerCount > 0) return 'in_progress';
  return 'todo';
}

/** `2026-11-11T14:00:00+01:00` — the instant keeps the learner's offset for display. */
export function offsetIso(instant: Date | string, timeZone: string): string {
  const parts = zonedParts(instant, timeZone);
  const sign = parts.offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(parts.offsetMinutes);
  return `${parts.localDate}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

/** Local `H:mm` of an instant, used by the card title. */
export function localHhmm(instant: Date | string, timeZone: string): string {
  const parts = zonedParts(instant, timeZone);
  return `${String(parts.hour)}:${pad(parts.minute)}`;
}

/** `mercredi 11 novembre` of a civil day (expiration and undo explanations). */
export function formatWarmupDay(day: string): string {
  const parsed = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return day;
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(parsed);
}

/** `ce matin`, `cet après-midi`, `hier`, `le 9 novembre` — the last-action prefix of SPEC-710. */
export function warmupWhen(createdAt: Date | string, now: Date | string, timeZone: string): string {
  const created = zonedParts(createdAt, timeZone);
  const current = zonedParts(now, timeZone);
  if (created.localDate === current.localDate) {
    return created.hour < 12 ? 'ce matin' : 'cet après-midi';
  }
  const yesterday = new Date(Date.UTC(current.year, current.month - 1, current.day) - 86_400_000);
  const yesterdayDay = `${String(yesterday.getUTCFullYear())}-${pad(yesterday.getUTCMonth() + 1)}-${pad(yesterday.getUTCDate())}`;
  if (created.localDate === yesterdayDay) return 'hier';
  return `le ${formatWarmupDay(created.localDate)}`;
}

/** Parsed `activities.config` of a warm-up; unknown keys are preserved for later specs. */
export const WarmupConfigSchema = z.looseObject({
  durationSec: z.number().int().positive().optional(),
  questionCount: z.number().int().min(1).max(10).optional(),
  scope: z.enum(['yesterday_prerequisites', 'yesterday', 'yesterday_and_prerequisites']).optional(),
  slotId: z.uuid().optional(),
  nextSession: z
    .looseObject({
      slotId: z.uuid().nullable().optional(),
      kind: z.string().optional(),
      startsAt: z.string().optional(),
      moduleId: z.uuid().nullable().optional(),
      activityId: z.uuid().nullable().optional(),
    })
    .optional(),
  items: z
    .array(
      z.looseObject({
        position: z.number().int().min(0),
        notionId: z.uuid(),
        tag: z.enum(['yesterday', 'prerequisite']),
        moduleNumber: z.number().int().min(1).nullable(),
      }),
    )
    .optional(),
});
export type WarmupConfig = z.infer<typeof WarmupConfigSchema>;

export function parseWarmupConfig(raw: unknown): WarmupConfig {
  const parsed = WarmupConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

/** Canonical scope of the stored config (the legacy value is accepted, ADR-0327). */
export function warmupScopeOf(config: WarmupConfig): WarmupScope {
  return config.scope === 'yesterday' ? 'yesterday' : 'yesterday_prerequisites';
}

/** One question/answer pair read from the exact brick version shown by the activity. */
export function questionOfBrick(
  type: string,
  payload: unknown,
): { question: string; answer: string } | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const raw = payload as Record<string, unknown>;
  const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

  if (type === 'recall_card') {
    const question = text(raw.front) || text(raw.prompt) || text(raw.question);
    const answer = text(raw.back) || text(raw.answer);
    return question === '' || answer === '' ? null : { question, answer };
  }
  if (type === 'choice_question') {
    const question = text(raw.stem) || text(raw.question);
    const options = Array.isArray(raw.options) ? raw.options : null;
    let answer = '';
    if (options !== null) {
      const correct = options.filter(
        (option) =>
          typeof option === 'object' &&
          option !== null &&
          (option as Record<string, unknown>).correct === true,
      );
      answer = correct
        .map((option) => text((option as Record<string, unknown>).text))
        .filter((value) => value !== '')
        .join(', ');
      const explanation = text(raw.explanation);
      if (answer !== '' && explanation !== '') answer = `${answer}. ${explanation}`;
    } else {
      const choices: unknown[] = Array.isArray(raw.choices) ? (raw.choices as unknown[]) : [];
      const label = text(raw.answer);
      const found = choices.find((choice) => text(choice) === label);
      answer = text(found) || label;
    }
    return question === '' || answer === '' ? null : { question, answer };
  }
  // Other warm-up formats are not produced by EF-3; a readable fallback keeps the card honest.
  const question = text(raw.stem) || text(raw.question) || text(raw.prompt) || text(raw.front);
  const answer = text(raw.answer) || text(raw.back);
  return question === '' || answer === '' ? null : { question, answer };
}

/** EF-10 — one-line explanation of the consumed action. */
export function warmupConsumedSummary(input: {
  knewCount: number;
  count: number;
  reviewLabels: readonly string[];
  nextQuiz: boolean;
}): string {
  let text = warmupScore(input.knewCount, input.count);
  if (input.reviewLabels.length > 0) {
    const count = input.reviewLabels.length;
    const verb = count > 1 ? `${String(count)} notions repassent` : '1 notion repasse';
    const moment = input.nextQuiz ? 'dans le prochain quiz global' : 'dans le quiz global du soir';
    text = `${text} ; ${verb} ${moment}`;
  }
  return `${text}.`;
}

/** EF-8 — a local civil day is due at the start of the following local day. */
export function nextLocalDay(day: string): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date) + 86_400_000);
  return `${String(shifted.getUTCFullYear())}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Duration of an answered first pass, in minutes, at least one. */
export function warmupMinutes(startedAt: Date | string, now: Date | string): number {
  return Math.max(
    1,
    Math.ceil((toInstant(now).getTime() - toInstant(startedAt).getTime()) / MS_PER_MINUTE),
  );
}
