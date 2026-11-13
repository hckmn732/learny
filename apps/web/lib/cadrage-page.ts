import { randomUUID } from 'node:crypto';

import { notFound, redirect } from 'next/navigation';

import type { CadrageStateDto } from '@learny/contracts';
import { createServiceContext, getCadragePageState } from '@learny/services';

import { SIGN_IN_PATH } from './route-guard';
import { loadShellPage, type ShellPageResult } from './sidebar-page';
import { readPageSession } from './supabase/page';

// Server load of the cadrage page (SPEC-604 EF-1, EF-13). The shell and the cadrage state use the
// same verified session; a formation that left `cadrage` is redirected to its programme, and a
// formation of another owner is a 404.

export interface CadragePageResult {
  shell: ShellPageResult;
  state: CadrageStateDto;
}

export async function loadCadragePage(formationId: string): Promise<CadragePageResult> {
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  const ctx = createServiceContext({ userId: session.userId, requestId: randomUUID() });
  const [shell, result] = await Promise.all([loadShellPage(), getCadragePageState(ctx, formationId)]);
  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND') notFound();
    throw result.error;
  }
  if (result.value.status !== 'cadrage') {
    redirect(`/formations/${formationId}/programme`);
  }
  return { shell, state: result.value.state };
}

/** Re-exported so the page keeps one import for its shell error rendering. */
export type { ShellPageResult };
