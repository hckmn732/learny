import { notFound, redirect } from 'next/navigation';

import type { HeaderDto, SidebarDto } from '@learny/contracts';

import { apiErrorRequestId, isApiError, serverApi } from './api/server-client';
import { SIGN_IN_PATH } from './route-guard';
import { readPageSession } from './supabase/page';

export type SidebarPageResult = { ok: true; data: SidebarDto } | { ok: false; requestId?: string };
export type HeaderPageResult = { ok: true; data: HeaderDto } | { ok: false; requestId?: string };

/** Both server-rendered DTOs of the connected shell (SPEC-304, SPEC-305). */
export interface ShellPageResult {
  sidebar: SidebarPageResult;
  header: HeaderPageResult;
}

async function pageClient() {
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  return serverApi();
}

function failure(error: unknown): { ok: false; requestId?: string } {
  const requestId = apiErrorRequestId(error);
  if (isApiError(error, 'UNAUTHENTICATED')) redirect(SIGN_IN_PATH);
  return requestId === undefined ? { ok: false } : { ok: false, requestId };
}

/** Sidebar data of a connected page; a failure renders the sidebar error state with retry. */
export async function loadSidebarPage(): Promise<SidebarPageResult> {
  const client = await pageClient();
  try {
    return { ok: true, data: await client.api.sidebarGet({}) };
  } catch (error) {
    return failure(error);
  }
}

/** Header data of a connected page; a failure renders the account error state with retry. */
export async function loadHeaderPage(): Promise<HeaderPageResult> {
  const client = await pageClient();
  try {
    return { ok: true, data: await client.api.headerGet({}) };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Shell data of a connected page (SPEC-305): the header and the sidebar are read once for the
 * same request and share the same learner session. Each failure keeps its own retry state.
 */
export async function loadShellPage(): Promise<ShellPageResult> {
  const client = await pageClient();
  const [sidebar, header] = await Promise.allSettled([
    client.api.sidebarGet({}),
    client.api.headerGet({}),
  ]);
  return {
    sidebar:
      sidebar.status === 'fulfilled' ? { ok: true, data: sidebar.value } : failure(sidebar.reason),
    header:
      header.status === 'fulfilled' ? { ok: true, data: header.value } : failure(header.reason),
  };
}

/**
 * ADR-0075 — opening a formation page selects it as the last consulted formation. The programme
 * page of SPEC-606 will replace the placeholder content while keeping this contract.
 */
export async function loadSidebarForFormation(formationId: string): Promise<SidebarPageResult> {
  const client = await pageClient();
  try {
    return {
      ok: true,
      data: await client.api.sidebarUpdate({
        body: { currentFormationId: formationId },
      }),
    };
  } catch (error) {
    if (isApiError(error, 'NOT_FOUND')) notFound();
    return failure(error);
  }
}

/** Same as `loadShellPage`, after selecting the formation of the current page (ADR-0075). */
export async function loadShellForFormation(formationId: string): Promise<ShellPageResult> {
  const client = await pageClient();
  const [sidebar, header] = await Promise.allSettled([
    client.api.sidebarUpdate({ body: { currentFormationId: formationId } }),
    client.api.headerGet({}),
  ]);
  if (sidebar.status === 'rejected' && isApiError(sidebar.reason, 'NOT_FOUND')) notFound();
  return {
    sidebar:
      sidebar.status === 'fulfilled' ? { ok: true, data: sidebar.value } : failure(sidebar.reason),
    header:
      header.status === 'fulfilled' ? { ok: true, data: header.value } : failure(header.reason),
  };
}
