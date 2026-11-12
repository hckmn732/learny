import { randomUUID } from 'node:crypto';

import { notFound, redirect } from 'next/navigation';

import type { SidebarDto } from '@learny/contracts';
import { AppError } from '@learny/core';
import { createServiceContext, getSidebar, selectCurrentFormation } from '@learny/services';

import { SIGN_IN_PATH } from './route-guard';
import { readPageSession } from './supabase/page';

export type SidebarPageResult = { ok: true; data: SidebarDto } | { ok: false; requestId?: string };

async function pageContext() {
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  return createServiceContext({ userId: session.userId, requestId: randomUUID() });
}

function failure(error: AppError): SidebarPageResult {
  return error.requestId === undefined ? { ok: false } : { ok: false, requestId: error.requestId };
}

/** Sidebar data of a connected page; a failure renders the sidebar error state with retry. */
export async function loadSidebarPage(): Promise<SidebarPageResult> {
  const ctx = await pageContext();
  const result = await getSidebar(ctx);
  return result.ok ? { ok: true, data: result.value } : failure(result.error);
}

/**
 * ADR-0075 — opening a formation page selects it as the last consulted formation. The programme
 * page of SPEC-606 will replace the placeholder content while keeping this contract.
 */
export async function loadSidebarForFormation(formationId: string): Promise<SidebarPageResult> {
  const ctx = await pageContext();
  const result = await selectCurrentFormation(ctx, formationId);
  if (!result.ok && result.error.code === 'NOT_FOUND') notFound();
  return result.ok ? { ok: true, data: result.value } : failure(result.error);
}
