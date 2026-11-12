import { randomUUID } from 'node:crypto';

import { notFound, redirect } from 'next/navigation';

import type { HeaderDto, SidebarDto } from '@learny/contracts';
import { AppError } from '@learny/core';
import {
  createServiceContext,
  getHeader,
  getSidebar,
  selectCurrentFormation,
} from '@learny/services';

import { SIGN_IN_PATH } from './route-guard';
import { readPageSession } from './supabase/page';

export type SidebarPageResult = { ok: true; data: SidebarDto } | { ok: false; requestId?: string };
export type HeaderPageResult = { ok: true; data: HeaderDto } | { ok: false; requestId?: string };

/** Both server-rendered DTOs of the connected shell (SPEC-304, SPEC-305). */
export interface ShellPageResult {
  sidebar: SidebarPageResult;
  header: HeaderPageResult;
}

async function pageContext() {
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  return createServiceContext({ userId: session.userId, requestId: randomUUID() });
}

function failure(error: AppError): { ok: false; requestId?: string } {
  return error.requestId === undefined ? { ok: false } : { ok: false, requestId: error.requestId };
}

/** Sidebar data of a connected page; a failure renders the sidebar error state with retry. */
export async function loadSidebarPage(): Promise<SidebarPageResult> {
  const ctx = await pageContext();
  const result = await getSidebar(ctx);
  return result.ok ? { ok: true, data: result.value } : failure(result.error);
}

/** Header data of a connected page; a failure renders the account error state with retry. */
export async function loadHeaderPage(): Promise<HeaderPageResult> {
  const ctx = await pageContext();
  const result = await getHeader(ctx);
  return result.ok ? { ok: true, data: result.value } : failure(result.error);
}

/**
 * Shell data of a connected page (SPEC-305): the header and the sidebar are read once for the
 * same request and share the same learner session. Each failure keeps its own retry state.
 */
export async function loadShellPage(): Promise<ShellPageResult> {
  const ctx = await pageContext();
  const [sidebar, header] = await Promise.all([getSidebar(ctx), getHeader(ctx)]);
  return {
    sidebar: sidebar.ok ? { ok: true, data: sidebar.value } : failure(sidebar.error),
    header: header.ok ? { ok: true, data: header.value } : failure(header.error),
  };
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

/** Same as `loadShellPage`, after selecting the formation of the current page (ADR-0075). */
export async function loadShellForFormation(formationId: string): Promise<ShellPageResult> {
  const ctx = await pageContext();
  const [sidebar, header] = await Promise.all([
    selectCurrentFormation(ctx, formationId),
    getHeader(ctx),
  ]);
  if (!sidebar.ok && sidebar.error.code === 'NOT_FOUND') notFound();
  return {
    sidebar: sidebar.ok ? { ok: true, data: sidebar.value } : failure(sidebar.error),
    header: header.ok ? { ok: true, data: header.value } : failure(header.error),
  };
}
