// Server data of the SPEC-501 demonstration (ADR-0049). The page works on the seeded Alex account,
// through the real service and RLS: no owner-role query outside the demonstration fixture.
import { randomUUID } from 'node:crypto';

import { AppError } from '@learny/core';
import { serviceDb, sql } from '@learny/db';
import {
  correctBrick,
  createBrick,
  createServiceContext,
  getPublicBrick,
  reportBrick,
} from '@learny/services';

export interface DemoBrickVersion {
  version: number;
  versionId: string;
  createdBy: 'tutor' | 'learner' | 'import';
  origin: 'resource' | 'tutor';
  createdAt: string;
  fingerprint: string | null;
}

export interface DemoBrick {
  brickId: string;
  status: 'active' | 'reported' | 'retired';
  currentVersion: number;
  versions: DemoBrickVersion[];
  publicPayload: unknown;
  publicVersionId: string;
}

export interface Spec501DemoData {
  brick: DemoBrick | null;
  error: string | null;
}

export const DEMO_EMAIL = 'alex.perrin@demo.learny.test';

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

async function brickById(identity: DemoIdentity, brickId: string): Promise<DemoBrick | null> {
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
    return { brick: null, error: null };
  } catch (error) {
    return {
      brick: null,
      error: error instanceof Error ? error.message : 'Démonstration indisponible.',
    };
  }
}

function identityRequired(found: DemoIdentity | null): DemoIdentity {
  if (found === null) throw new AppError('NOT_FOUND', 'Jeu de démonstration absent.');
  if (found.notionIds.length < 2) {
    throw new AppError('NOT_FOUND', 'Deux notions de démonstration sont nécessaires.');
  }
  return found;
}

function choicePayload(notionIds: readonly string[], stem: string) {
  return {
    stem,
    mode: 'single' as const,
    options: [
      { id: 'a', text: 'Le compte de banque', correct: true, notionId: notionIds[0] },
      { id: 'b', text: 'Le compte de capital', correct: false, notionId: notionIds[1] },
    ],
    explanation: 'L’encaissement augmente le compte de banque au débit.',
    objective: 'Distinguer un compte d’actif d’un compte de passif',
    sources: [],
  };
}

export async function createDemoBrick(): Promise<Spec501DemoData> {
  const demo = identityRequired(await demoIdentity());
  const created = await createBrick(demoContext(demo), {
    type: 'choice_question',
    formationId: demo.formationId,
    purpose: 'bank',
    notionIds: [demo.notionIds[0] as string],
    origin: 'tutor',
    payload: choicePayload(demo.notionIds, 'Quel compte augmente au débit ?'),
    createdBy: 'tutor',
  });
  if (!created.ok) throw created.error;
  return { brick: await brickById(demo, created.value.brickId), error: null };
}

export async function reportDemoBrick(brickId: string): Promise<Spec501DemoData> {
  const demo = identityRequired(await demoIdentity());
  const reported = await reportBrick(demoContext(demo), brickId, {
    reason: 'La formulation est ambiguë pour un débutant.',
  });
  if (!reported.ok) throw reported.error;
  return { brick: await brickById(demo, brickId), error: null };
}

export async function correctDemoBrick(brickId: string): Promise<Spec501DemoData> {
  const demo = identityRequired(await demoIdentity());
  const rows = await serviceDb().execute<{
    current_version: number;
    payload: { stem?: string };
  }>(sql`
    select b.current_version, v.payload
    from public.bricks b
    join public.brick_versions v
      on v.brick_id = b.id and v.version = b.current_version
    where b.id = ${brickId}::uuid and b.owner_id = ${demo.userId}::uuid
  `);
  const current = rows[0];
  if (current === undefined) throw new AppError('NOT_FOUND', 'Brique de démonstration absente.');
  const stem = current.payload.stem ?? 'Quel compte augmente au débit ?';
  const corrected = await correctBrick(demoContext(demo), brickId, {
    expectedVersion: current.current_version,
    payload: choicePayload(demo.notionIds, `${stem.replace(/ — corrigé$/u, '')} — corrigé`),
  });
  if (!corrected.ok) throw corrected.error;
  return { brick: await brickById(demo, brickId), error: null };
}
