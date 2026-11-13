// Server actions of the SPEC-501 demonstration. They only act on the seeded Alex account and on the
// brick created by this page (cookie); every mutation goes through the real service and RLS.
'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { AppError } from '@learny/core';
import { serviceDb, sql } from '@learny/db';
import { correctBrick, createBrick, reportBrick } from '@learny/services';

import { DEMO_BRICK_COOKIE, demoContext, demoIdentity, type DemoIdentity } from './spec-501-data';

const PAGE = '/_dev/sdd/SPEC-501';

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

async function identity(): Promise<DemoIdentity> {
  const found = await demoIdentity();
  if (found === null) throw new AppError('NOT_FOUND', 'Jeu de démonstration absent.');
  if (found.notionIds.length < 2) {
    throw new AppError('NOT_FOUND', 'Deux notions de démonstration sont nécessaires.');
  }
  return found;
}

async function setBrickCookie(brickId: string): Promise<void> {
  (await cookies()).set(DEMO_BRICK_COOKIE, brickId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60,
  });
}

export async function createDemoBrick(): Promise<void> {
  const demo = await identity();
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
  await setBrickCookie(created.value.brickId);
  revalidatePath(PAGE);
}

export async function reportDemoBrick(): Promise<void> {
  const demo = await identity();
  const brickId = (await cookies()).get(DEMO_BRICK_COOKIE)?.value;
  if (brickId === undefined) throw new AppError('NOT_FOUND', 'Aucune brique de démonstration.');
  const reported = await reportBrick(demoContext(demo), brickId, {
    reason: 'La formulation est ambiguë pour un débutant.',
  });
  if (!reported.ok) throw reported.error;
  revalidatePath(PAGE);
}

export async function correctDemoBrick(): Promise<void> {
  const demo = await identity();
  const brickId = (await cookies()).get(DEMO_BRICK_COOKIE)?.value;
  if (brickId === undefined) throw new AppError('NOT_FOUND', 'Aucune brique de démonstration.');

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
  revalidatePath(PAGE);
}

export async function resetDemoBrick(): Promise<void> {
  (await cookies()).delete(DEMO_BRICK_COOKIE);
  revalidatePath(PAGE);
}
