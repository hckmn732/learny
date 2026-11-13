import { z } from 'zod';

import { CourseCitationSource, type CourseCitationSource as Source } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql } from '@learny/db';

import type { ServiceContext } from '../context';
import type { ResourceDeps } from '../resources/deps';
import { getSignedReadUrl } from '../resources/read';
import { requireUser, toResult } from '../resources/result';

// SPEC-609 EF-2, ET-1, ET-3, CL-3, BR-COU-02 — resolve the controlled link of a citation.
//
// The browser never receives a model-produced URL: it asks this service with the citation id. The
// citation and its resource are read under the caller's RLS client; a deleted or foreign source
// returns the "source supprimée" label without signing anything. PDF and image files get a
// ten-minute signed read URL with the page fragment, web sources keep their own URL with the
// anchor or the media minute.

interface CitationSourceRow extends Record<string, unknown> {
  id: string;
  media_kind: string;
  location: unknown;
  resource_id: string | null;
  resource_kind: string | null;
  url: string | null;
  deleted_at: Date | null;
  status: string | null;
  storage_path: string | null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function intOf(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

function withFragment(url: string, fragment: string | null): string {
  if (fragment === null) return url;
  const [base, existing] = url.split('#', 2);
  return `${base ?? url}#${existing === undefined || existing === '' ? fragment : existing}`;
}

export function getCitationSource(
  ctx: ServiceContext,
  deps: ResourceDeps,
  citationId: string,
): Promise<Result<Source>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!z.uuid().safeParse(citationId).success) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de citation invalide.');
    }
    const row = await db.run(async (tx) => {
      const rows = await tx.execute<CitationSourceRow>(sql`
        select
          ci.id::text as id,
          ci.media_kind::text as media_kind,
          ci.location,
          ci.resource_id::text as resource_id,
          r.kind::text as resource_kind,
          r.url,
          r.deleted_at,
          r.status::text as status,
          r.storage_path
        from public.citations ci
        left join public.resources r
          on r.id = ci.resource_id and r.owner_id = ci.owner_id
        where ci.id = ${citationId}::uuid
          and ci.owner_id = ${userId}::uuid
        limit 1
      `);
      return rows[0];
    });
    if (row === undefined) throw new AppError('NOT_FOUND', 'Citation introuvable.');

    const location = asObject(row.location);
    const page = intOf(location?.page);
    const startSec = intOf(location?.startSec);
    const anchor = typeof location?.anchor === 'string' ? location.anchor.slice(0, 200) : null;
    const deleted =
      row.resource_id === null ||
      row.resource_kind === null ||
      row.deleted_at !== null ||
      row.status !== 'ready';

    if (deleted) {
      return CourseCitationSource.parse({
        citationId: row.id,
        mediaKind: row.media_kind,
        deleted: true,
        url: null,
        page: null,
        startSec: null,
        anchor: null,
      });
    }

    let url: string | null = null;
    if (row.resource_kind === 'pdf' || row.resource_kind === 'image') {
      const signed = await getSignedReadUrl(ctx, deps, row.resource_id ?? '');
      if (!signed.ok) {
        if (signed.error.code === 'NOT_FOUND') {
          return CourseCitationSource.parse({
            citationId: row.id,
            mediaKind: row.media_kind,
            deleted: true,
            url: null,
            page: null,
            startSec: null,
            anchor: null,
          });
        }
        throw signed.error;
      }
      const fragment = page === null ? null : `page=${String(page)}`;
      url = withFragment(signed.value.url, fragment);
    } else if (row.url !== null) {
      const fragment =
        anchor !== null
          ? anchor
          : startSec !== null
            ? `t=${String(startSec)}`
            : null;
      url = withFragment(row.url, fragment);
    }

    return CourseCitationSource.parse({
      citationId: row.id,
      mediaKind: row.media_kind,
      deleted: false,
      url,
      page: row.resource_kind === 'pdf' || row.resource_kind === 'image' ? page : null,
      startSec: row.resource_kind === 'web' || row.resource_kind === 'youtube' ? startSec : null,
      anchor: row.resource_kind === 'web' ? anchor : null,
    });
  });
}
