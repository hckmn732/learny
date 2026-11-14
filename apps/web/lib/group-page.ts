import { randomUUID } from 'node:crypto';

import { notFound, redirect } from 'next/navigation';

import type { GroupState, InvitationPreview } from '@learny/contracts';
import { createServiceContext, getFormationGroup, getInvitationPreview } from '@learny/services';

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
  const ctx = createServiceContext({ userId: session.userId, requestId: randomUUID() });
  const result = await getFormationGroup(ctx, formationId);
  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND') notFound();
    throw result.error;
  }
  const shell = await loadShellForFormation(formationId);
  return { shell, state: result.value };
}

export type InvitationPageResult =
  | { kind: 'ok'; preview: InvitationPreview; signedIn: boolean }
  | { kind: 'invalid' }
  | { kind: 'not-found' };

export async function loadInvitationPage(code: string): Promise<InvitationPageResult> {
  const session = await readPageSession();
  const ctx = createServiceContext({ userId: session?.userId ?? null, requestId: randomUUID() });
  const result = await getInvitationPreview(ctx, code);
  if (!result.ok) {
    if (result.error.code === 'VALIDATION_FAILED') return { kind: 'invalid' };
    if (result.error.code === 'NOT_FOUND') return { kind: 'not-found' };
    throw result.error;
  }
  return { kind: 'ok', preview: result.value, signedIn: session !== null };
}
