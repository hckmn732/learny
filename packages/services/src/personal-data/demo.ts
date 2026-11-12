// Demonstration service of SPEC-211 (EF-9): the real export service on a deterministic dataset,
// the real schedule/cancel flow and a complete J+30 deletion of a throwaway account. Only the demo
// bypasses the three-a-day limit (it creates its own row); everything else is the production path.
import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { sql } from 'drizzle-orm';

import type {
  DevDeletionOutput,
  DevExecutionOutput,
  DevExportOutput,
  EmailLine,
} from '@learny/contracts';
import { AppError, type Clock } from '@learny/core';
import { serviceDb } from '@learny/db';
import {
  collectExportData,
  createMemoryExportDeps,
  defaultExportDeps,
  defaultDeletionDeps,
  formatLongDate,
  runAccountDeletion,
  runDataExport,
  type StepRunner,
} from '@learny/jobs';
import { listOutbox } from '@learny/notifications/email';

import type { ServiceContext } from '../context';

import { cancelDeletion, scheduleDeletion } from './deletion';
import { DELETION_DELAY_MS } from './deletion';
import { exportOwnerEmail } from './export';

const DEMO_TITLE = 'SAP S/4HANA Finance';
const directStep: StepRunner = { run: (_id, body) => body() };

function stepFor(): StepRunner {
  return directStep;
}

function emailsFor(to: string | null): EmailLine[] {
  return listOutbox()
    .filter((entry) => to === null || entry.message.to === to)
    .map((entry) => ({
      template: entry.message.tags.find((tag) => tag.name === 'template')?.value ?? 'email',
      to: entry.message.to,
      at: entry.at,
    }));
}

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? '';
  if (url === '' || key === '') {
    throw new AppError('SERVICE_UNAVAILABLE', 'Supabase local non configuré.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Creates the deterministic demo programme of one learner, once (idempotent by title). */
export async function seedDemoData(userId: string): Promise<void> {
  const db = serviceDb();
  const existing = await db.execute<{ id: string }>(sql`
    select id::text as id from public.formations
    where owner_id = ${userId}::uuid and title = ${DEMO_TITLE}
    limit 1
  `);
  if (existing[0] !== undefined) return;
  await db.transaction(async (tx) => {
    const [formation] = await tx.execute<{ id: string }>(sql`
      insert into public.formations (owner_id, title, description, objectives, status)
      values (
        ${userId}::uuid,
        ${DEMO_TITLE},
        ${'Comptabilité générale et clôture annuelle.'},
        '{operational}'::public.formation_objective[],
        'active'
      )
      returning id::text as id
    `);
    if (formation === undefined) throw new Error('formation de démonstration non créée');
    const [module] = await tx.execute<{ id: string }>(sql`
      insert into public.modules (formation_id, position, title, status)
      values (${formation.id}::uuid, 1, ${'Comptabilité générale'}, 'open')
      returning id::text as id
    `);
    if (module === undefined) throw new Error('module de démonstration non créé');
    const [chapter] = await tx.execute<{ id: string }>(sql`
      insert into public.chapters (module_id, formation_id, position, title)
      values (${module.id}::uuid, ${formation.id}::uuid, 1, ${'Saisie des pièces'})
      returning id::text as id
    `);
    if (chapter === undefined) throw new Error('chapitre de démonstration non créé');
    await tx.execute(sql`
      insert into public.notions (formation_id, module_id, chapter_id, label, short_definition, position)
      values (
        ${formation.id}::uuid, ${module.id}::uuid, ${chapter.id}::uuid,
        ${'Partie double'}, ${'Tout débit a un crédit de même montant.'}, 1
      )
    `);
    const [course] = await tx.execute<{ id: string }>(sql`
      insert into public.courses (owner_id, formation_id, module_id, version, status)
      values (${userId}::uuid, ${formation.id}::uuid, ${module.id}::uuid, 1, 'ready')
      returning id::text as id
    `);
    if (course === undefined) throw new Error('cours de démonstration non créé');
    await tx.execute(sql`
      insert into public.course_sections
        (course_id, owner_id, chapter_id, position, kind, anchor, title, content_md, origin)
      values
        (${course.id}::uuid, ${userId}::uuid, ${chapter.id}::uuid, 1, 'text', 'section-1-1',
         ${'Le principe de la partie double'}, ${'## Le principe\n\nChaque écriture équilibre un débit et un crédit.'}, 'tutor'),
        (${course.id}::uuid, ${userId}::uuid, ${chapter.id}::uuid, 2, 'text', 'section-1-2',
         ${'Le plan comptable'}, ${'## Le plan comptable\n\nLes comptes sont classés par nature.'}, 'tutor')
    `);
    await tx.execute(sql`
      insert into public.resources (owner_id, formation_id, chapter_id, kind, title, content_text, metadata)
      values (
        ${userId}::uuid, ${formation.id}::uuid, ${chapter.id}::uuid, 'note',
        ${'Mémo partie double'}, ${'Débit = emploi, crédit = ressource.'}, '{"demo":true}'::jsonb
      )
    `);
  });
}

function exportDeps() {
  try {
    return defaultExportDeps();
  } catch {
    // Local demonstration without Supabase Storage: the tree and the size stay real, the object
    // is kept in memory for this process only.
    return createMemoryExportDeps();
  }
}

/** EF-9 — one complete export of the demo dataset, with the produced tree. */
export async function runExportDemo(ctx: ServiceContext): Promise<DevExportOutput> {
  if (ctx.userId === null) throw new AppError('UNAUTHENTICATED', 'Vous devez être connecté.');
  await seedDemoData(ctx.userId);
  const deps = exportDeps();
  const started = ctx.clock.now();
  const row = await serviceDb().transaction(async (tx) => {
    const [created] = await tx.execute<{ id: string }>(sql`
      insert into public.data_exports (user_id, status, requested_on, created_at)
      values (
        ${ctx.userId}::uuid, 'queued',
        (select (${ctx.clock.now().toISOString()}::timestamptz at time zone p.timezone)::date
         from public.profiles p where p.id = ${ctx.userId}::uuid),
        ${ctx.clock.now().toISOString()}::timestamptz
      )
      returning id::text as id
    `);
    if (created === undefined) throw new AppError('INTERNAL_ERROR', 'Export non créé.');
    return created.id;
  });
  const outcome = await runDataExport(
    {
      ctx: { ...ctx, sdb: serviceDb(), clock: ctx.clock },
      step: stepFor(),
      logger: ctx.logger,
      userId: ctx.userId,
      exportId: row,
    },
    deps,
  );
  const [stored] = await serviceDb().execute<{
    id: string;
    status: string;
    size_bytes: number | null;
    created_at: Date | string;
    expires_at: Date | string | null;
  }>(sql`
    select id::text as id, status::text as status, size_bytes::float8 as size_bytes,
           created_at, expires_at
    from public.data_exports where id = ${row}::uuid
  `);
  if (stored === undefined) throw new AppError('NOT_FOUND', 'Export introuvable.');
  const email = await exportOwnerEmail(ctx.userId);
  const createdAt =
    stored.created_at instanceof Date ? stored.created_at : new Date(stored.created_at);
  const expiresAt =
    stored.expires_at === null
      ? null
      : stored.expires_at instanceof Date
        ? stored.expires_at
        : new Date(stored.expires_at);
  return {
    export: {
      id: stored.id,
      status: stored.status as DevExportOutput['export']['status'],
      sizeBytes: stored.size_bytes,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt === null ? null : expiresAt.toISOString(),
    },
    tree: outcome.entries,
    durationMs: Math.max(0, ctx.clock.now().getTime() - started.getTime()),
    emails: emailsFor(email),
  };
}

/** EF-9 — schedules the deletion through the real service. */
export async function runDeletionDemo(ctx: ServiceContext): Promise<DevDeletionOutput> {
  if (ctx.userId === null) throw new AppError('UNAUTHENTICATED', 'Vous devez être connecté.');
  const result = await scheduleDeletion(ctx);
  if (!result.ok) throw result.error;
  return {
    scheduledFor: result.value.scheduledFor,
    emails: emailsFor(await exportOwnerEmail(ctx.userId)),
  };
}

/** EF-9 — cancels the deletion through the real service. */
export async function cancelDeletionDemo(ctx: ServiceContext): Promise<DevDeletionOutput> {
  if (ctx.userId === null) throw new AppError('UNAUTHENTICATED', 'Vous devez être connecté.');
  const result = await cancelDeletion(ctx);
  if (!result.ok) throw result.error;
  return { scheduledFor: null, emails: emailsFor(await exportOwnerEmail(ctx.userId)) };
}

/** EF-9, CA-4 — complete deletion of a throwaway account at J+30, with the remaining-row table. */
export async function runExecutionDemo(ctx: ServiceContext): Promise<DevExecutionOutput> {
  if (ctx.userId === null) throw new AppError('UNAUTHENTICATED', 'Vous devez être connecté.');
  const admin = supabaseAdmin();
  const email = `sdd-211-throwaway-${ctx.userId.slice(0, 8)}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const created = await admin.auth.admin.createUser({
    email,
    password: `pw-${ctx.userId}-${String(ctx.clock.now().getTime())}`,
    email_confirm: true,
  });
  if (created.error !== null) {
    throw new AppError('SERVICE_UNAVAILABLE', 'Compte jetable non créé.');
  }
  const throwawayId = created.data.user.id;
  await seedDemoData(throwawayId);
  const now = ctx.clock.now();
  const scheduledFor = new Date(now.getTime() + DELETION_DELAY_MS);
  await serviceDb().execute(sql`
    update public.profiles
    set deletion_requested_at = ${now.toISOString()}::timestamptz,
        deletion_scheduled_for = ${scheduledFor.toISOString()}::timestamptz
    where id = ${throwawayId}::uuid
  `);
  const later: Clock = { now: () => new Date(scheduledFor.getTime()) };
  let outcome;
  try {
    outcome = await runAccountDeletion(
      {
        ctx: { ...ctx, sdb: serviceDb(), clock: later },
        step: stepFor(),
        logger: ctx.logger,
        userId: throwawayId,
      },
      defaultDeletionDeps(),
    );
  } finally {
    // Never leave a throwaway account behind if a step failed before the Auth deletion.
    await admin.auth.admin.deleteUser(throwawayId).catch(() => undefined);
  }
  return {
    scheduledFor: scheduledFor.toISOString(),
    tables: outcome.tables.map((row) => ({ table: row.table, remaining: row.remaining })),
    authStatus: outcome.authStatus,
    emails: emailsFor(email),
  };
}

/** Collection preview used by the tests next to the demo (same code as the job). */
export async function previewDemoCollection(userId: string, now: Date) {
  return collectExportData(userId, now);
}

export { formatLongDate };
