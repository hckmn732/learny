process.env.APP_ENV = 'test';
process.env.JOBS_MODE = 'inline';

import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';

import { createServiceContext } from '../../src/context';
import {
  adjustProposal,
  generateProposal,
  getProgrammeState,
  importProposal,
  validateProposal,
} from '../../src/programme';

const PREFIX = 'sdd-605-';
const FIXED = new Date('2026-11-11T12:20:00Z');

class TestClock implements Clock {
  now(): Date {
    return new Date(FIXED);
  }
}

interface Learner {
  userId: string;
  email: string;
  ctx: ReturnType<typeof createServiceContext>;
}

async function learner(label: string, subscribed = true): Promise<Learner> {
  return serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx, {
      email: `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`,
    });
    if (subscribed) {
      await tx.execute(sql`
        insert into public.subscriptions (user_id, status, current_period_end)
        values (${user.id}::uuid, 'active', '2030-01-01T00:00:00Z')
      `);
    }
    return {
      userId: user.id,
      email: user.email,
      ctx: createServiceContext({
        userId: user.id,
        email: user.email,
        requestId: randomUUID(),
        clock: new TestClock(),
      }),
    };
  });
}

const DONE_PROFILE = {
  scope: { value: 'Comptabilité générale, fournisseurs, clients, immobilisations', state: 'done' },
  starting_point: { value: 'Bonnes bases en comptabilité', state: 'done' },
  target_level: { value: 'Utilisateur autonome, Certification SAP', state: 'done' },
  volume: { value: '10 h par semaine', state: 'done' },
  dates: { value: 'Du 18 novembre au 20 décembre', state: 'done' },
};

async function seedCadrage(
  userId: string,
  title = 'SAP S/4HANA Finance',
  status: 'cadrage' | 'programme_proposed' = 'cadrage',
): Promise<string> {
  return serviceDb().transaction(async (tx) => {
    const [formation] = await tx.execute<{ id: string }>(sql`
      insert into public.formations (
        owner_id, title, description, status, course_language, monogram, accent_color,
        cadrage_profile, objectives, volume_hours, start_date, end_date
      )
      values (
        ${userId}::uuid,
        ${title},
        'Devenir opérationnel sur les processus financiers de SAP S/4HANA.',
        ${status},
        'fr',
        'SA',
        'indigo',
        ${JSON.stringify(DONE_PROFILE)}::jsonb,
        '{operational,exam}'::public.formation_objective[],
        150,
        '2026-11-02',
        '2026-12-11'
      )
      returning id::text as id
    `);
    if (formation === undefined) throw new Error('formation non créée');
    await tx.execute(sql`
      insert into public.event_outbox (event_id, name, data, user_id, created_at)
      values (
        ${`cadrage-completed:${formation.id}`},
        'formation/cadrage-completed',
        ${JSON.stringify({ userId, formationId: formation.id })}::jsonb,
        ${userId}::uuid,
        ${FIXED.toISOString()}::timestamptz
      )
      on conflict (event_id) do nothing
    `);
    return formation.id;
  });
}

async function counts(formationId: string): Promise<{
  proposals: number;
  modules: number;
  chapters: number;
  notions: number;
}> {
  const rows = await serviceDb().execute<{
    proposals: number;
    modules: number;
    chapters: number;
    notions: number;
  }>(sql`
    select
      (select count(*)::int from public.programme_proposals where formation_id = ${formationId}::uuid) as proposals,
      (select count(*)::int from public.modules where formation_id = ${formationId}::uuid) as modules,
      (select count(*)::int from public.chapters where formation_id = ${formationId}::uuid) as chapters,
      (select count(*)::int from public.notions where formation_id = ${formationId}::uuid) as notions
  `);
  return rows[0] ?? { proposals: 0, modules: 0, chapters: 0, notions: 0 };
}

afterAll(async () => {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
  await closeDb();
});

describe('[SPEC-605] programme', () => {
  it('CA-1 — génère une proposition sans activer la formation ni créer de module', async () => {
    const fx = await learner('generate');
    const fid = await seedCadrage(fx.userId);

    const result = await generateProposal(fx.ctx, fid, { expectedVersion: 0 });
    if (!result.ok) throw result.error;
    expect(result.value.formationStatus).toBe('programme_proposed');
    expect(result.value.proposal?.source).toBe('generated');
    expect(result.value.proposal?.modules).toHaveLength(7);
    expect(result.value.proposal?.proposalStatus).toBe('proposed');
    expect(await counts(fid)).toMatchObject({ proposals: 1, modules: 0, chapters: 0, notions: 0 });

    const formation = await serviceDb().execute<{ status: string }>(sql`
      select status::text as status from public.formations where id = ${fid}::uuid
    `);
    expect(formation[0]?.status).toBe('programme_proposed');
  });

  it('CA-3 — un ajustement puis un import créent des versions distinctes, l’ancienne reste lisible', async () => {
    const fx = await learner('versions');
    const fid = await seedCadrage(fx.userId);
    const generated = await generateProposal(fx.ctx, fid, { expectedVersion: 0 });
    if (!generated.ok) throw generated.error;

    const adjusted = await adjustProposal(fx.ctx, fid, {
      expectedVersion: 1,
      message: 'Ajoute un module sur les immobilisations et passe le dernier seuil à 85 %.',
    });
    if (!adjusted.ok) throw adjusted.error;
    expect(adjusted.value.proposal?.version).toBe(2);
    expect(adjusted.value.proposal?.modules).toHaveLength(8);
    expect(await counts(fid)).toMatchObject({ proposals: 2, modules: 0, chapters: 0 });

    const old = await getProgrammeState(fx.ctx, fid, { version: 1 });
    if (!old.ok) throw old.error;
    expect(old.value.proposal?.version).toBe(1);
    expect(old.value.proposal?.modules).toHaveLength(7);

    const imported = await importProposal(fx.ctx, fid, {
      kind: 'text',
      expectedVersion: 2,
      text: 'Module 1 : Introduction\nChapitre 1 : Bilan\nNotion : Actif\nModule 2 : Analyse\nChapitre 2 : Ratios\nNotion : Marge',
    });
    if (!imported.ok) throw imported.error;
    expect(imported.value.proposal?.version).toBe(3);
    expect(imported.value.proposal?.source).toBe('imported');
    expect(imported.value.proposal?.modules).toHaveLength(3);
    expect(imported.value.proposal?.versions.map((version) => version.version)).toEqual([3, 2, 1]);
    expect(await counts(fid)).toMatchObject({ proposals: 3, modules: 0, chapters: 0 });
  });

  it('CA-1/CA-3 — la validation crée la structure, ouvre le module 1 et n’émet qu’un événement', async () => {
    const fx = await learner('validate');
    const fid = await seedCadrage(fx.userId);
    const generated = await generateProposal(fx.ctx, fid, { expectedVersion: 0 });
    if (!generated.ok) throw generated.error;
    const version = generated.value.proposal?.version ?? 1;

    const validated = await validateProposal(fx.ctx, fid, { expectedVersion: version });
    if (!validated.ok) throw validated.error;
    expect(validated.value.formationStatus).toBe('active');
    expect(validated.value.proposal?.proposalStatus).toBe('active');
    expect(validated.value.proposal?.modules[0]?.status).toBe('open');
    expect(validated.value.proposal?.modules[1]?.status).toBe('locked');

    const structure = await counts(fid);
    expect(structure).toMatchObject({ proposals: 1, modules: 7, chapters: 24 });

    const statuses = await serviceDb().execute<{ position: number; status: string }>(sql`
      select position, status::text as status
      from public.modules
      where formation_id = ${fid}::uuid
      order by position
    `);
    expect(statuses.map((row) => row.status)).toEqual([
      'open',
      'locked',
      'locked',
      'locked',
      'locked',
      'locked',
      'locked',
    ]);
    const progress = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.module_progress
      where user_id = ${fx.userId}::uuid
    `);
    expect(progress[0]?.count).toBe(7);

    const again = await validateProposal(fx.ctx, fid, { expectedVersion: version });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe('CONFLICT');
    expect(await counts(fid)).toMatchObject({ modules: 7, chapters: 24 });

    const events = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.event_outbox
      where event_id = ${`programme-validated:${fid}`}
    `);
    expect(events[0]?.count).toBe(1);
  });

  it('CA-2 — un brouillon hors seuil échoue après corrections sans écrire de version', async () => {
    const fx = await learner('invalid-threshold');
    const fid = await seedCadrage(fx.userId, 'Formation invalide');
    const result = await generateProposal(fx.ctx, fid, { expectedVersion: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(['AI_TASK_FAILED', 'MOCK_STEPS_EXHAUSTED']).toContain(result.error.code);
    expect(await counts(fid)).toMatchObject({ proposals: 0, modules: 0 });
  });

  it('CA-4 — un autre utilisateur reçoit 404 et une version obsolète est un conflit', async () => {
    const owner = await learner('owner');
    const other = await learner('other');
    const fid = await seedCadrage(owner.userId);
    const generated = await generateProposal(owner.ctx, fid, { expectedVersion: 0 });
    if (!generated.ok) throw generated.error;

    const read = await getProgrammeState(other.ctx, fid);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.error.code).toBe('NOT_FOUND');
    const write = await generateProposal(other.ctx, fid, { expectedVersion: 0 });
    expect(write.ok).toBe(false);
    if (!write.ok) expect(write.error.code).toBe('NOT_FOUND');

    const stale = await adjustProposal(owner.ctx, fid, {
      expectedVersion: 99,
      message: 'Une demande obsolète.',
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe('CONFLICT');
    expect(await counts(fid)).toMatchObject({ proposals: 1 });
  });

  it('CA-4 — trois formations actives refusent la quatrième validation', async () => {
    const fx = await learner('limit');
    await serviceDb().transaction(async (tx) => {
      for (let index = 0; index < 3; index += 1) {
        await createTestProgramme(tx, fx.userId, {
          modules: 1,
          chaptersPerModule: 1,
          notionsPerChapter: 1,
          title: `Formation active ${String(index + 1)}`,
        });
      }
    });
    const fid = await seedCadrage(fx.userId, 'Formation proposée');
    const generated = await generateProposal(fx.ctx, fid, { expectedVersion: 0 });
    if (!generated.ok) throw generated.error;
    const version = generated.value.proposal?.version ?? 1;

    const result = await validateProposal(fx.ctx, fid, { expectedVersion: version });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORMATION_LIMIT_REACHED');
    expect(await counts(fid)).toMatchObject({ modules: 0, chapters: 0 });
    const status = await serviceDb().execute<{ status: string }>(sql`
      select status::text as status from public.formations where id = ${fid}::uuid
    `);
    expect(status[0]?.status).toBe('programme_proposed');
  });

  it('CL-5 — une IA indisponible conserve le fichier importé et la proposition précédente', async () => {
    const fx = await learner('no-ai', false);
    const fid = await seedCadrage(fx.userId);
    const generated = await generateProposal(fx.ctx, fid, { expectedVersion: 0 });
    expect(generated.ok).toBe(false);
    if (!generated.ok) expect(generated.error.code).toBe('AI_UNAVAILABLE');
    expect(await counts(fid)).toMatchObject({ proposals: 0 });

    const original = Buffer.from('Module 1 : Comptabilité\nChapitre 1 : Bilan').toString('base64');
    const imported = await importProposal(fx.ctx, fid, {
      kind: 'file',
      filename: 'programme.txt',
      contentBase64: original,
      expectedVersion: 0,
    });
    expect(imported.ok).toBe(false);
    if (!imported.ok) expect(imported.error.code).toBe('AI_UNAVAILABLE');

    const rows = await serviceDb().execute<{
      status: string;
      original_content: string | null;
      original_filename: string | null;
    }>(sql`
      select status::text as status, original_content, original_filename
      from public.programme_imports
      where formation_id = ${fid}::uuid
      order by created_at desc
      limit 1
    `);
    expect(rows[0]).toMatchObject({
      status: 'failed',
      original_content: original,
      original_filename: 'programme.txt',
    });
    expect(await counts(fid)).toMatchObject({ proposals: 0, modules: 0 });
  });

  it('un import vide ne crée ni import ni version', async () => {
    const fx = await learner('empty-import');
    const fid = await seedCadrage(fx.userId);
    const imported = await importProposal(fx.ctx, fid, {
      kind: 'text',
      text: '   ',
      expectedVersion: 0,
    });
    expect(imported.ok).toBe(false);
    if (!imported.ok) expect(imported.error.code).toBe('TEXT_EMPTY');
    const imports = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.programme_imports
      where formation_id = ${fid}::uuid
    `);
    expect(imports[0]?.count).toBe(0);
    expect(await counts(fid)).toMatchObject({ proposals: 0 });
  });
});
