import { notFound, redirect } from 'next/navigation';

import { isActiveProgramme, type ProgrammeScreenStateDto } from '@learny/contracts';

import { isApiError, serverApi } from './api/server-client';
import { SIGN_IN_PATH } from './route-guard';
import { loadShellForFormation, loadShellPage, type ShellPageResult } from './sidebar-page';
import { readPageSession } from './supabase/page';

// Server load of the programme page (SPEC-605, SPEC-606). A formation of another owner is a 404;
// an uncompleted cadrage goes back to its cadrage; a proposed programme renders the proposal flow
// and a validated one renders the active screen. Archived formations are not programme screens.

export interface ProgrammePageResult {
  shell: ShellPageResult;
  state: ProgrammeScreenStateDto;
}

export async function loadProgrammePage(formationId: string): Promise<ProgrammePageResult> {
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  const client = await serverApi();
  let state: ProgrammeScreenStateDto;
  try {
    state = await client.api.programmeGet({ params: { fid: formationId }, query: {} });
  } catch (error) {
    if (isApiError(error, 'NOT_FOUND')) notFound();
    if (isApiError(error, 'UNAUTHENTICATED')) redirect(SIGN_IN_PATH);
    throw error;
  }
  // A proposal is not yet an active formation: selecting it through the formation switcher would
  // answer NOT_FOUND (ADR-0075), so only the active screen makes it current.
  const shell = isActiveProgramme(state)
    ? await loadShellForFormation(formationId)
    : await loadShellPage();
  if (isActiveProgramme(state)) return { shell, state };
  if (state.formationStatus === 'archived') redirect('/accueil');
  if (state.formationStatus === 'cadrage' && !state.cadrageCompleted) {
    redirect(`/formations/${formationId}/cadrage`);
  }
  return { shell, state };
}

export type { ShellPageResult };
