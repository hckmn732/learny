// Server data of the SPEC-501 demonstration (ADR-0049). The page works on the seeded Alex account,
// through the real service and RLS: no owner-role query outside the demonstration fixture.
import { randomUUID } from 'node:crypto';

import { cookies } from 'next/headers';

import { serviceDb, sql } from '@learny/db';
import { createServiceContext, getPublicBrick } from '@learny/services';

import type { DemoBrick, DemoBrickVersion, Spec501DemoData } from './spec-501-types';

export const DEMO_EMAIL = 'alex.perrin@demo.learny.test';
export const DEMO_BRICK_COOKIE = 'spec501BrickId';

export interface DemoIdentity {
  userId: string;
  formationId: string;
  notionIds: string[];
}

const cache = new Map<string, DemoIdentity | null>();

export async function demoIdentity(): Promise<DemoIdentity | null> {
  const cached = cache.get(DEMO_EMAIL);
  if (cached !== undefined) return cached;
  const rows = await serviceDb().execute<{
    user_id: string;
    formation_id: string | null;
    notion_id: string | null;
  }>(sql`
    select
      p.id::text as user_id,
      f.id::text as formation_id,
      n.id::text as notion_id
    from public.profiles p
    left join public.formations f on f.owner_id = p.id and f.status = 'active'
    left join public.notions n on n.formation_id = f.id
    where p.email = ${DEMO_EMAIL}
    order by f.created_at, n.position
  `);
  const first = rows[0];
  if (first === undefined || first.formation_id === null) {
    cache.set(DEMO_EMAIL, null);
    return null;
  }
  const identity: DemoIdentity = {
    userId: first.user_id,
    formationId: first.formation_id,
    notionIds: rows
      .map((row) => row.notion_id)
      .filter((id): id is string => id !== null)
      .slice(0, 2),
  };
  cache.set(DEMO_EMAIL, identity);
  return identity;
}

export function demoContext(identity: DemoIdentity) {
  return createServiceContext({
    userId: identity.userId,
    email: DEMO_EMAIL,
    requestId: `sdd-501-${randomUUID().slice(0, 8)}`,
  });
}

interface BrickRow {
  [key: string]: unknown;
  brick_id: string;
  status: 'active' | 'reported' | 'retired';
  current_version: number;
  version: number;
  version_id: string;
  created_by: 'tutor' | 'learner' | 'import';
  origin: 'resource' | 'tutor';
  created_at: string;
  fingerprint: string | null;
}

async function brickFromCookie(identity: DemoIdentity): Promise<DemoBrick | null> {
  const brickId = (await cookies()).get(DEMO_BRICK_COOKIE)?.value;
  if (brickId === undefined || !/^[0-9a-f-]{36}$/.test(brickId)) return null;

  const rows = await serviceDb().execute<BrickRow>(sql`
    select
      b.id::text as brick_id,
      b.status::text as status,
      b.current_version as current_version,
      v.version,
      v.id::text as version_id,
      v.created_by::text as created_by,
      v.origin::text as origin,
      v.created_at::text as created_at,
      v.fingerprint
    from public.bricks b
    join public.brick_versions v on v.brick_id = b.id
    where b.id = ${brickId}::uuid and b.owner_id = ${identity.userId}::uuid
    order by v.version desc
  `);
  const first = rows[0];
  if (first === undefined) return null;

  const versions: DemoBrickVersion[] = rows.map((row) => ({
    version: row.version,
    versionId: row.version_id,
    createdBy: row.created_by,
    origin: row.origin,
    createdAt: row.created_at,
    fingerprint: row.fingerprint,
  }));

  const publicVersion = rows.find((row) => row.version === first.current_version) ?? first;
  const publicBrick = await getPublicBrick(demoContext(identity), publicVersion.version_id);
  return {
    brickId: first.brick_id,
    status: first.status,
    currentVersion: first.current_version,
    versions,
    publicPayload: publicBrick.ok ? publicBrick.value.publicPayload : null,
    publicVersionId: publicVersion.version_id,
  };
}

export async function loadSpec501Demo(): Promise<Spec501DemoData> {
  try {
    const identity = await demoIdentity();
    if (identity === null) {
      return {
        brick: null,
        error: 'Jeu de démonstration absent : lancer `pnpm db:seed:demo`.',
      };
    }
    return { brick: await brickFromCookie(identity), error: null };
  } catch (error) {
    return {
      brick: null,
      error: error instanceof Error ? error.message : 'Démonstration indisponible.',
    };
  }
}
