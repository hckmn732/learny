import { randomUUID } from 'node:crypto';

import { notFound, redirect } from 'next/navigation';

import { isActiveProgramme, type ProgrammeScreenStateDto } from '@learny/contracts';
import { createServiceContext, getProgrammeScreenState } from '@learny/services';

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
  const ctx = createServiceContext({ userId: session.userId, requestId: randomUUID() });
  const result = await getProgrammeScreenState(ctx, formationId);
  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND') notFound();
    throw result.error;
  }
  // A proposal is not yet an active formation: selecting it through the formation switcher would
  // answer NOT_FOUND (ADR-0075), so only the active screen makes it current.
  const shell = isActiveProgramme(result.value)
    ? await loadShellForFormation(formationId)
    : await loadShellPage();
  if (isActiveProgramme(result.value)) return { shell, state: result.value };
  if (result.value.formationStatus === 'archived') redirect('/accueil');
  if (result.value.formationStatus === 'cadrage' && !result.value.cadrageCompleted) {
    redirect(`/formations/${formationId}/cadrage`);
  }
  return { shell, state: result.value };
}

export type { ShellPageResult };
