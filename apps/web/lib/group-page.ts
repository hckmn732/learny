import { notFound, redirect } from 'next/navigation';

import type { GroupState, InvitationPreview } from '@learny/contracts';

import { isApiError, serverApi } from './api/server-client';
import { SIGN_IN_PATH } from './route-guard';
import { loadShellForFormation, type ShellPageResult } from './sidebar-page';
import { readPageSession } from './supabase/page';

// Server loads of the shared-formation screens (SPEC-724 SCR-17). The group page is authenticated
// and reads the caller's own RLS client; the invitation page is public and only exposes the title
// and capacity of the group. No personal row of another learner ever reaches these loaders.

export interface GroupPageResult {
  shell: ShellPageResult;
  state: GroupState;
}

export async function loadGroupPage(formationId: string): Promise<GroupPageResult> {
  const session = await readPageSession();
  if (session === null) redirect(`${SIGN_IN_PATH}?suite=/formations/${formationId}/groupe`);
  const client = await serverApi();
  try {
    const [state, shell] = await Promise.all([
      client.api.formationGroupGet({ params: { fid: formationId } }),
      loadShellForFormation(formationId),
    ]);
    return { shell, state };
  } catch (error) {
    if (isApiError(error, 'NOT_FOUND')) notFound();
    if (isApiError(error, 'UNAUTHENTICATED')) {
      redirect(`${SIGN_IN_PATH}?suite=/formations/${formationId}/groupe`);
    }
    throw error;
  }
}

export type InvitationPageResult =
  | { kind: 'ok'; preview: InvitationPreview; signedIn: boolean }
  | { kind: 'invalid' }
  | { kind: 'not-found' };

export async function loadInvitationPage(code: string): Promise<InvitationPageResult> {
  const session = await readPageSession();
  const client = await serverApi();
  try {
    const preview = await client.api.invitationGet({ params: { code } });
    return { kind: 'ok', preview, signedIn: session !== null };
  } catch (error) {
    if (isApiError(error, 'VALIDATION_FAILED')) return { kind: 'invalid' };
    if (isApiError(error, 'NOT_FOUND')) return { kind: 'not-found' };
    throw error;
  }
}
