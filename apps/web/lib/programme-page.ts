import { randomUUID } from 'node:crypto';

import { notFound, redirect } from 'next/navigation';

import type { ProgrammeProposalStateDto } from '@learny/contracts';
import { createServiceContext, getProgrammePageState } from '@learny/services';

import { SIGN_IN_PATH } from './route-guard';
import { loadShellPage, type ShellPageResult } from './sidebar-page';
import { readPageSession } from './supabase/page';

// Server load of the programme page (SPEC-605). A formation of another owner is a 404; a cadrage
// that was not explicitly completed goes back to its cadrage. A completed cadrage renders the
// proposal state, and the client starts the single generation task when no version exists yet.

export interface ProgrammePageResult {
  shell: ShellPageResult;
  state: ProgrammeProposalStateDto;
}

export async function loadProgrammePage(formationId: string): Promise<ProgrammePageResult> {
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  const ctx = createServiceContext({ userId: session.userId, requestId: randomUUID() });
  const [shell, result] = await Promise.all([
    loadShellPage(),
    getProgrammePageState(ctx, formationId),
  ]);
  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND') notFound();
    throw result.error;
  }
  if (result.value.formationStatus === 'cadrage' && !result.value.cadrageCompleted) {
    redirect(`/formations/${formationId}/cadrage`);
  }
  return { shell, state: result.value };
}

export type { ShellPageResult };
