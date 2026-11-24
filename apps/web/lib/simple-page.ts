import { notFound, redirect } from 'next/navigation';

import {
  isActiveProgramme,
  type ActiveProgrammeDto,
  type ProgrammeProposalStateDto,
  type SimpleState,
} from '@learny/contracts';

import {
  toSummaryModules,
  type ProgrammeSummary,
  type ProgrammeSummaryModule,
} from '../components/simple/simple-mode';

import { isApiError, serverApi } from './api/server-client';
import { SIGN_IN_PATH } from './route-guard';
import { loadShellForFormation, loadShellPage, type ShellPageResult } from './sidebar-page';
import { readPageSession } from './supabase/page';

// Chargements serveur du mode simple (SPEC-4002 ET-1). L'écran ne reçoit que l'état serveur : le
// statut de la préparation, les sources et, pour l'aperçu, la proposition courante.

export interface SimpleDepotPageResult {
  shell: ShellPageResult;
  state: SimpleState;
}

async function simpleStateOf(fid: string): Promise<SimpleState> {
  const client = await serverApi();
  try {
    return await client.api.simpleGet({ params: { fid } });
  } catch (error) {
    if (isApiError(error, 'NOT_FOUND')) notFound();
    if (isApiError(error, 'UNAUTHENTICATED')) redirect(SIGN_IN_PATH);
    if (isApiError(error, 'SIMPLE_NOT_SIMPLE')) redirect(`/formations/${fid}/programme`);
    throw error;
  }
}

/** SCR-21 et SCR-22 — dépôt et analyse d'une formation en mode simple. */
export async function loadSimpleDepotPage(fid: string): Promise<SimpleDepotPageResult> {
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  const [state, shell] = await Promise.all([simpleStateOf(fid), loadShellPage()]);
  // L'analyse est terminée : l'aperçu est l'étape en cours (EF-4).
  if (state.status === 'proposed') redirect(`/formations/${fid}/apercu`);
  return { shell, state };
}

export interface SimpleOverviewPageResult {
  shell: ShellPageResult;
  state: SimpleState;
  programme: ProgrammeProposalStateDto;
}

/** SCR-23 — aperçu du programme proposé, lu avec son état de préparation. */
export async function loadSimpleOverviewPage(fid: string): Promise<SimpleOverviewPageResult> {
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  // Une formation en mode simple n'est pas encore active : la coquille ordinaire est utilisée,
  // comme la page de proposition de SPEC-605 (le sélecteur de formation refuserait la formation).
  const [state, shell] = await Promise.all([simpleStateOf(fid), loadShellPage()]);
  if (state.status === 'collecting' || state.status === 'analysing') {
    redirect(`/formations/${fid}/depot`);
  }
  const client = await serverApi();
  try {
    const programme = await client.api.programmeGet({ params: { fid }, query: {} });
    if (isActiveProgramme(programme)) redirect(`/formations/${fid}/diagnostic`);
    if (programme.proposal === null) redirect(`/formations/${fid}/depot`);
    return { shell, state, programme };
  } catch (error) {
    if (isApiError(error, 'NOT_FOUND')) notFound();
    if (isApiError(error, 'UNAUTHENTICATED')) redirect(SIGN_IN_PATH);
    throw error;
  }
}

export interface SimpleDiagnosticPageResult {
  shell: ShellPageResult;
  state: SimpleState;
  programme: ProgrammeSummary;
}

/** Le programme d'un écran de résultat : la proposition, ou le programme actif une fois validé. */
function summaryOf(programme: ProgrammeProposalStateDto | ActiveProgrammeDto): ProgrammeSummary {
  if (isActiveProgramme(programme)) {
    // Le DTO du programme actif ne porte pas les pages ni les notions : seuls les titres et les
    // chapitres servent l'écran de résultat, les pages viennent du document quand elles existent.
    const modules: ProgrammeSummaryModule[] = programme.modules.map((module) => ({
      position: module.position,
      title: module.title,
      plannedEnd: module.plannedEnd,
      pageFrom: null,
      pageTo: null,
      chapters: programme.chapters
        .filter((chapter) => chapter.moduleId === module.id)
        .map((chapter) => ({ position: chapter.position, title: chapter.title, notions: [] })),
    }));
    return {
      title: programme.formation.title,
      volumeHours: programme.formation.volumeHours,
      modules,
    };
  }
  return {
    title: programme.proposal?.title ?? programme.title,
    volumeHours: programme.proposal?.volumeHours ?? null,
    modules: toSummaryModules(programme.proposal?.modules ?? []),
  };
}

/** SCR-24 — diagnostic global, ouvert après la validation du programme. */
export async function loadSimpleDiagnosticPage(fid: string): Promise<SimpleDiagnosticPageResult> {
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  const [state, shell] = await Promise.all([simpleStateOf(fid), loadShellForFormation(fid)]);
  if (state.status !== 'proposed') redirect(`/formations/${fid}/apercu`);
  const client = await serverApi();
  const programme = await client.api.programmeGet({ params: { fid }, query: {} });
  return { shell, state, programme: summaryOf(programme) };
}

/** SCR-24 — résultat du diagnostic et premier chapitre. */
export async function loadSimpleResultPage(fid: string): Promise<SimpleDiagnosticPageResult> {
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  const [state, shell] = await Promise.all([simpleStateOf(fid), loadShellForFormation(fid)]);
  const client = await serverApi();
  const programme = await client.api.programmeGet({ params: { fid }, query: {} });
  return { shell, state, programme: summaryOf(programme) };
}
