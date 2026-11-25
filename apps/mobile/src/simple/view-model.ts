// Modèle d'affichage du mode simple (SPEC-4003 EF-2, EF-6 à EF-8 ; canevas § 2).
//
// Aucune règle métier ici : le serveur décide les rôles, les statuts, les pages et les dates. Ce
// module ne fait que projeter les DTO dans les libellés et les valeurs de la maquette, pour que les
// écrans restent des rendus et que les tests unitaires couvrent les cas limites (liste vide,
// nombre de modules, échéance, diagnostic passé).
import type {
  ProgrammeModuleDto,
  ProgrammeProposalDto,
  SimpleGenerationModule,
  SimpleState,
} from '@learny/contracts';
import { fr } from '@learny/i18n';

import { civilDayMonth } from '../lib/dates';

const t = fr.mobile.simple;

/** Rôles d'un document, dans l'ordre de la maquette (SPEC-4002 EF-2). */
export const ROLE_ORDER = ['course', 'exercises', 'exam_papers', 'other'] as const;
export type SimpleRole = (typeof ROLE_ORDER)[number];

/** Libellé d'un rôle (`Cours`, `Exercices`, `Annales`, `Autre support`). */
export function roleLabel(role: SimpleRole): string {
  return t.deposit.roles[role];
}

/** Taille lisible d'un fichier (`38 Mo`, `512 ko`). */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes <= 0) return '';
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1) return `${String(Math.round(megabytes))} Mo`;
  return `${String(Math.max(1, Math.round(bytes / 1024)))} ko`;
}

/** Métadonnées d'une ligne de fichier (`712 pages · 38 Mo`). */
export function fileMeta(input: {
  readonly pages?: number | null;
  readonly sizeBytes?: number | null;
}): string {
  const pages =
    input.pages === null || input.pages === undefined ? '' : `${String(input.pages)} pages`;
  const size = formatBytes(input.sizeBytes);
  return [pages, size].filter((part) => part !== '').join(' · ');
}

/** Une source du serveur, telle que la ligne de dépôt l'affiche. */
export interface SourceRow {
  readonly id: string;
  readonly title: string;
  readonly role: SimpleRole;
  readonly pages: number | null;
  readonly status: 'queued' | 'processing' | 'ready' | 'failed';
  readonly statusLabel: string;
}

/** Projette les sources du serveur dans l'ordre de la maquette. */
export function sourceRows(state: SimpleState | null): readonly SourceRow[] {
  if (state === null) return [];
  return state.sources.map((source) => ({
    id: source.resourceId,
    title: source.title,
    role: source.role,
    pages: source.pages,
    status: source.status,
    statusLabel:
      source.status === 'ready'
        ? t.deposit.statuses.ready
        : source.status === 'failed'
          ? t.deposit.statuses.failed
          : source.status === 'processing'
            ? t.deposit.statuses.processing
            : t.deposit.statuses.queued,
  }));
}

/** Une source de rôle `course` est prête : le bouton de création peut s'activer. */
export function hasReadyCourse(state: SimpleState | null): boolean {
  return (
    state !== null &&
    state.sources.some((source) => source.role === 'course' && source.status === 'ready')
  );
}

/** Un document de rôle `course` existe, même encore en lecture. */
export function hasCourseSource(state: SimpleState | null): boolean {
  return state !== null && state.sources.some((source) => source.role === 'course');
}

/** Progression de l'analyse : étapes terminées sur les quatre. */
export function analysisProgress(state: SimpleState | null): number {
  if (state === null) return 0;
  const done = state.steps.filter((step) => step.state === 'done').length;
  return done / state.steps.length;
}

/** Libellé d'une étape d'analyse. */
export function stepLabel(key: SimpleState['steps'][number]['key']): string {
  return t.analysis.steps[key];
}

/** Indicateurs de l'aperçu (EF-6 de SPEC-4002). */
export interface PreviewKpis {
  readonly modules: string;
  readonly hours: string;
  readonly perDay: string;
  readonly end: string;
}

function weekdaysBetween(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  let days = 0;
  for (let time = start.getTime(); time <= end.getTime(); time += 86_400_000) {
    const weekday = new Date(time).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
  }
  return days;
}

/** Quatre indicateurs de la maquette, calculés à partir de la proposition du serveur. */
export function previewKpis(proposal: ProgrammeProposalDto | null): PreviewKpis {
  if (proposal === null) {
    return { modules: '—', hours: '—', perDay: '—', end: '—' };
  }
  const modules = proposal.modules.length;
  const hours = proposal.volumeHours ?? 0;
  const starts = proposal.modules.map((module) => module.plannedStart).sort();
  const ends = proposal.modules.map((module) => module.plannedEnd).sort();
  const first = starts[0] ?? '';
  const last = ends[ends.length - 1] ?? '';
  const days = weekdaysBetween(first, last);
  const perDay = hours > 0 && days > 0 ? Math.max(1, Math.round((hours / days) * 10) / 10) : 0;
  return {
    modules: String(modules),
    hours: `${String(hours)} h`,
    perDay: `${String(perDay).replace('.', ',')} h`,
    end: last === '' ? '—' : civilDayMonth(last),
  };
}

/** Liste des modules affichés : quatre sur mobile, puis « + N autres modules » (EF-6). */
export const MOBILE_MODULE_LIMIT = 4;

export interface ModuleRow {
  readonly id: string;
  readonly position: number;
  readonly title: string;
  readonly chapters: number;
  readonly hours: string;
  readonly pages: string | null;
}

/** Modules de l'aperçu, avec le nombre d'autres modules. */
export function moduleRows(proposal: ProgrammeProposalDto | null): {
  readonly shown: readonly ModuleRow[];
  readonly others: number;
} {
  if (proposal === null) return { shown: [], others: 0 };
  const shown = proposal.modules.slice(0, MOBILE_MODULE_LIMIT).map((module) => ({
    id: `module-${String(module.position)}`,
    position: module.position,
    title: module.title,
    chapters: module.chapters.length,
    hours: moduleHours(module),
    pages:
      module.pageFrom !== null &&
      module.pageFrom !== undefined &&
      module.pageTo !== null &&
      module.pageTo !== undefined
        ? `p. ${String(module.pageFrom)}–${String(module.pageTo)}`
        : null,
  }));
  return { shown, others: Math.max(0, proposal.modules.length - shown.length) };
}

/** Volume d'un module, déduit de sa plage de pages (2 à 8 h, ADR-4003 D7), pour l'affichage. */
export function moduleHours(module: ProgrammeModuleDto): string {
  const pages =
    module.pageFrom !== null &&
    module.pageFrom !== undefined &&
    module.pageTo !== null &&
    module.pageTo !== undefined
      ? module.pageTo - module.pageFrom + 1
      : 0;
  const hours = pages > 0 ? Math.min(8, Math.max(2, Math.round(pages / 40))) : null;
  return hours === null ? '—' : `${String(hours)} h`;
}

/** Ligne de score du résultat ; `null` quand le diagnostic a été passé. */
export function scoreLine(input: {
  readonly skipped: boolean;
  readonly score: number | null;
  readonly total: number;
}): string | null {
  if (input.skipped || input.score === null || input.total <= 0) return null;
  return t.result.score(Math.round((input.score / 100) * input.total), input.total);
}

/** Titre du résultat : nombre de modules acquis (EF-8). */
export function acquiredTitle(acquired: number): string {
  return t.result.acquired(acquired);
}

/** Une ligne de la liste « Préparation du programme » (EF-12 de SPEC-4001). */
export interface GenerationRow {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly state: SimpleGenerationModule['state'];
}

export function generationRows(state: SimpleState | null): readonly GenerationRow[] {
  const generation = state?.generation;
  if (generation === undefined) return [];
  return generation.map((module) => ({
    id: module.moduleId,
    title: `Module ${String(module.position)} · ${module.title}`,
    detail: t.result.states[module.state],
    state: module.state,
  }));
}

/** Premier module non acquis : celui dont le premier chapitre est prêt (EF-8). */
export function firstAvailableModule(
  proposal: ProgrammeProposalDto | null,
  acquired: readonly string[],
): ProgrammeModuleDto | null {
  if (proposal === null) return null;
  const acquiredIds = new Set(acquired);
  return (
    proposal.modules.find((module) => !acquiredIds.has(`module-${String(module.position)}`)) ?? null
  );
}

/** `True` quand l'analyse est terminée et que l'aperçu peut s'ouvrir. */
export function isProposed(state: SimpleState | null): boolean {
  return state?.status === 'proposed';
}

/** Nombre de modules restants après le diagnostic. */
export function remainingModules(proposal: ProgrammeProposalDto | null, acquired: number): number {
  const total = proposal?.modules.length ?? 0;
  return Math.max(0, total - acquired);
}
