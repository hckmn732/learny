// Règles d'affichage pures du mode simple (SPEC-4002 EF-5, EF-7 ; CA-3).
// Aucune lecture d'horloge ici : le jour courant est toujours reçu en paramètre (ADR-0047), ce qui
// rend les indicateurs testables et déterministes.

import type {
  ProgrammeModuleDto,
  ResourceRole,
  SimpleGenerationModule,
  SimpleSource,
  SimpleState,
} from '@learny/contracts';

export const ROLE_ORDER: readonly ResourceRole[] = ['course', 'exercises', 'exam_papers', 'other'];

export const DAY_MS = 86_400_000;
/** CL-8 — une échéance plus proche que quinze jours est refusée par l'API. */
export const MIN_DEADLINE_DAYS = 15;
/** EF-8 — le planning finit quatorze jours avant l'échéance (même règle que le domaine Python). */
export const DEADLINE_MARGIN_DAYS = 14;

/** « 2 h », « 2 h 20 », « 45 min » — la maquette écrit les heures d'étude en heures et minutes. */
export function formatHours(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${String(rest)} min`;
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest)}`;
}

export function parseCivilDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function civilDateOf(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

/** Jours ouvrés (lundi à vendredi) entre deux dates civiles, bornes comprises. */
export function businessDaysBetween(from: string, to: string): number {
  const start = parseCivilDate(from).getTime();
  const end = parseCivilDate(to).getTime();
  if (end < start) return 0;
  let count = 0;
  for (let at = start; at <= end; at += DAY_MS) {
    const weekday = new Date(at).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}

export interface StudyIndicators {
  /** Heures d'étude du programme, arrondies comme la maquette. */
  studyHours: string;
  /** Rythme quotidien affiché, en minutes. */
  perDayMinutes: number;
  perDay: string;
  /** Dernier jour planifié du programme (`YYYY-MM-DD`). */
  endDate: string | null;
}

/**
 * EF-5 / CA-3 — les indicateurs de l'aperçu : heures d'étude, rythme quotidien et fin prévue.
 * Le rythme est `volume / jours ouvrés restants` : choisir une échéance plus lointaine le baisse,
 * une échéance plus proche le hausse, et la fin prévue suit le dernier module planifié.
 */
export function studyIndicators(input: {
  volumeHours: number | null;
  endDate: string | null;
  today: string;
}): StudyIndicators {
  const endDate = input.endDate;
  const minutes = input.volumeHours === null ? 0 : Math.round(input.volumeHours * 60);
  const days = endDate === null ? 0 : businessDaysBetween(input.today, endDate);
  const perDayMinutes = days === 0 ? minutes : Math.round(minutes / days);
  return {
    studyHours: minutes === 0 ? '—' : formatHours(minutes),
    perDayMinutes,
    perDay: perDayMinutes === 0 ? '—' : formatHours(perDayMinutes),
    endDate,
  };
}

/** EF-8 — fin planifiée pour une échéance : quatorze jours avant, jamais avant aujourd'hui. */
export function deadlineEndDate(deadline: string, today: string): string {
  const end = new Date(parseCivilDate(deadline).getTime() - DEADLINE_MARGIN_DAYS * DAY_MS);
  const candidate = civilDateOf(end);
  return candidate < today ? today : candidate;
}

/** Dernier jour planifié de la proposition (EF-5, « fin prévue »). */
export function proposalEndDate(modules: readonly ProgrammeModuleDto[]): string | null {
  const ends = modules.map((module) => module.plannedEnd).sort();
  return ends.at(-1) ?? null;
}

/** Heures d'un module, réparties sur ses chapitres (EF-7, « Cours · 25 min »). */
export function moduleMinutes(
  volumeHours: number | null,
  moduleChapters: number,
  totalChapters: number,
): number {
  if (volumeHours === null || totalChapters === 0) return 0;
  return Math.round((volumeHours * 60 * moduleChapters) / totalChapters);
}

/**
 * Durée annoncée du premier chapitre : la part du module revenant à un chapitre, bornée à une
 * séance de 20 à 45 minutes comme les chapitres Learny (ADR-4003 D7).
 */
export function chapterMinutes(moduleHours: number, chapterCount: number): number {
  if (chapterCount === 0) return 20;
  const share = Math.round(moduleHours / chapterCount);
  return Math.min(45, Math.max(20, share));
}

/** Nombre d'exercices d'un chapitre : une question par notion (BR-QUI-01, une à deux par notion). */
export function exerciseCount(notions: number): number {
  return Math.max(1, notions);
}

export interface ReadyChapter {
  module: SimpleGenerationModule;
  chapterTitle: string;
  chapterPosition: number;
  chapterCount: number;
  pages: { from: number; to: number } | null;
  courseMinutes: number;
  exercises: number;
}

/**
 * EF-7 — le premier chapitre prêt : premier module non acquis de la préparation, avec la part du
 * programme qui lui revient. `null` quand aucun module n'est encore planifié.
 */
export function readyChapter(
  generation: readonly SimpleGenerationModule[],
  modules: readonly ProgrammeModuleDto[],
  volumeHours: number | null,
): ReadyChapter | null {
  const current =
    generation.find((entry) => entry.state === 'ready') ??
    generation.find((entry) => entry.state === 'generating') ??
    generation.find((entry) => entry.state === 'queued') ??
    null;
  if (current === null) return null;
  const planned = modules.find((candidate) => candidate.position === current.position);
  const chapter = planned?.chapters[0];
  const totalChapters = modules.reduce((count, entry) => count + entry.chapters.length, 0);
  const minutes = moduleMinutes(volumeHours, planned?.chapters.length ?? 0, totalChapters);
  const pages =
    planned === undefined || planned.pageFrom == null || planned.pageTo == null
      ? null
      : { from: planned.pageFrom, to: planned.pageTo };
  return {
    module: current,
    chapterTitle: chapter?.title ?? current.title,
    chapterPosition: chapter?.position ?? 1,
    chapterCount: planned?.chapters.length ?? 0,
    pages,
    courseMinutes: chapterMinutes(minutes, planned?.chapters.length ?? 1),
    exercises: exerciseCount(chapter?.notions.length ?? 1),
  };
}

/** EF-4 — les chapitres trouvés s'arrêtent au dernier reçu : le libellé suit la liste. */
export function chaptersFound(state: SimpleState | null): SimpleState['chaptersFound'] {
  return state?.chaptersFound ?? [];
}

/** EF-5 — au-delà de six modules, la liste s'arrête et le reste est résumé (maquette). */
export const MODULE_PREVIEW_LIMIT = 6;

export function visibleModules(modules: readonly ProgrammeModuleDto[]): {
  visible: ProgrammeModuleDto[];
  hidden: ProgrammeModuleDto[];
} {
  return {
    visible: modules.slice(0, MODULE_PREVIEW_LIMIT),
    hidden: modules.slice(MODULE_PREVIEW_LIMIT),
  };
}

export interface SourceSummary {
  documents: number;
  pages: number;
  sentence: string;
}

/**
 * EF-5 — la ligne « D'après … » : le manuel avec ses pages, puis les autres rôles déposés.
 * La phrase reprend la maquette (« tes TD corrigés et 3 sessions d'annales »).
 */
export function sourceSummary(sources: readonly SimpleSource[]): SourceSummary {
  const course = sources.filter((source) => source.role === 'course');
  const exercises = sources.filter((source) => source.role === 'exercises');
  const papers = sources.filter((source) => source.role === 'exam_papers');
  const pages = course.reduce((total, source) => total + (source.pages ?? 0), 0);
  const parts: string[] = [];
  if (course.length > 0) {
    const titles = course.map((source) => `« ${source.title} »`).join(', ');
    parts.push(pages > 0 ? `${titles} (${String(pages)} p.)` : titles);
  }
  if (exercises.length > 0) parts.push('tes TD corrigés');
  if (papers.length > 0) {
    parts.push(`${String(papers.length)} session${papers.length === 1 ? '' : 's'} d’annales`);
  }
  return {
    documents: sources.length,
    pages,
    sentence: parts.join(', '),
  };
}

/** EF-2 — « Créer ma formation » n'est actif qu'avec un document de rôle « Cours » prêt. */
export function hasReadyCourseFile(
  files: readonly { role: ResourceRole; status: FileStatus }[],
  sources: readonly SimpleSource[],
): boolean {
  const local = files.some((file) => file.role === 'course' && file.status === 'ready');
  const remote = sources.some(
    (source) =>
      source.role === 'course' && (source.status === 'ready' || source.status === 'processing'),
  );
  return local || remote;
}

export type FileStatus = 'queued' | 'uploading' | 'processing' | 'ready' | 'failed';

/** EF-4 — une étape est « en cours » tant que la précédente n'est pas terminée. */
export function analysisProgress(steps: readonly { state: string }[]): number {
  if (steps.length === 0) return 0;
  const done = steps.filter((step) => step.state === 'done').length;
  return Math.round((done / steps.length) * 100);
}

/** Réponse d'erreur lisible : le message de l'API quand il existe, sinon le libellé générique. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim() !== '') return error.message;
  return fallback;
}
