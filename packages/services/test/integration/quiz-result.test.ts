import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';
import { makeModuleWithBank } from '@learny/testing';

import { createServiceContext, type ServiceContext } from '../../src/context';
import { startValidationAttempt } from '../../src/quiz';
import { unlockModule } from '../../src/quiz/module-unlock';
import { getQuizResult } from '../../src/quiz/result';
import { retryAvailability } from '../../src/quiz/retry-gate';
import { completeRemediation, getRemediation, prepareRemediation } from '../../src/remediation';

const PREFIX = 'sdd-612-result-';
const FIXED = new Date('2026-11-11T12:20:00Z');

class TestClock implements Clock {
  current = FIXED;
  now(): Date {
    return new Date(this.current);
  }
}

interface Fixture {
  userId: string;
  formationId: string;
  moduleIds: string[];
  notionIds: string[];
  ctx: ServiceContext;
  clock: TestClock;
}

async function fixture(label: string): Promise<Fixture> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  return serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx, { email });
    const programme = await createTestProgramme(tx, user.id, {
      modules: 2,
      chaptersPerModule: 1,
      notionsPerChapter: 12,
      title: 'SAP S/4HANA Finance',
    });
    const first = programme.moduleIds[0] ?? '';
    const second = programme.moduleIds[1] ?? '';
    await tx.execute(sql`
      update public.modules set status = 'open', threshold = 80, title = 'Comptabilité générale'
      where id = ${first}::uuid
    `);
    await tx.execute(sql`
      update public.modules set status = 'locked', threshold = 80,
        title = 'Comptabilité fournisseurs'
      where id = ${second}::uuid
    `);
    await tx.execute(sql`
      insert into public.module_progress (user_id, module_id, status)
      values (${user.id}::uuid, ${first}::uuid, 'open')
    `);
    await makeModuleWithBank(tx, {
      userId: user.id,
      formationId: programme.formationId,
      moduleId: first,
      notions: 12,
      variantsPerFormat: 3,
    });
    await tx.execute(sql`
      insert into public.subscriptions (user_id, status, current_period_end)
      values (${user.id}::uuid, 'active', '2030-01-01T00:00:00Z')
    `);
    const clock = new TestClock();
    return {
      userId: user.id,
      formationId: programme.formationId,
      moduleIds: programme.moduleIds,
      notionIds: programme.notionIds,
      ctx: createServiceContext({
        userId: user.id,
        email,
        requestId: randomUUID(),
        clock,
      }),
      clock,
    };
  });
}

async function failedAttempt(fx: Fixture, score: number, attemptNo = 2): Promise<string> {
  const moduleId = fx.moduleIds[0] ?? '';
  const attemptId = await serviceDb().transaction(async (tx) => {
    const activity = await tx.execute<{ id: string }>(sql`
      insert into public.activities (owner_id, formation_id, module_id, kind, config, items, status)
      values (
        ${fx.userId}::uuid, ${fx.formationId}::uuid, ${moduleId}::uuid,
        'validation_quiz', '{"threshold":80,"questionCount":12,"scoring":"equal"}'::jsonb,
        '[]'::jsonb, 'draft'
      ) returning id::text as id
    `);
    const rows = await tx.execute<{ id: string }>(sql`
      insert into public.attempts (
        user_id, activity_id, attempt_no, status, started_at, submitted_at, score, passed, per_notion
      ) values (
        ${fx.userId}::uuid, ${activity[0]?.id ?? ''}::uuid, ${attemptNo}, 'graded',
        ${FIXED.toISOString()}::timestamptz, ${FIXED.toISOString()}::timestamptz, ${score}, false,
        ${JSON.stringify(
          Object.fromEntries(
            fx.notionIds
              .slice(0, 12)
              .map((id, index) => [
                id,
                { correct: index < 8 ? 1 : 0, total: 1, score: index < 8 ? 100 : 0 },
              ]),
          ),
        )}::jsonb
      ) returning id::text as id
    `);
    return rows[0]?.id ?? '';
  });
  await serviceDb().execute(sql`
    insert into public.attempts (
      user_id, activity_id, attempt_no, status, started_at, submitted_at, score, passed
    )
    select ${fx.userId}::uuid, activity_id, 1, 'graded',
           ${FIXED.toISOString()}::timestamptz, ${FIXED.toISOString()}::timestamptz, 58, false
    from public.attempts where id = ${attemptId}::uuid
    on conflict do nothing
  `);
  return attemptId;
}

async function addGaps(fx: Fixture): Promise<void> {
  const ids = fx.notionIds.slice(0, 12);
  const natures = ['confusion', 'misunderstanding', 'application'];
  const evidences = [
    'Confondue avec le type de pièce dans 2 réponses.',
    'Erreurs aux tentatives 1 et 2, réponses ouvertes à côté du sujet.',
    'Définition juste, mais exercice de saisie échoué.',
  ];
  for (const [index, notionId] of ids.entries()) {
    const gap = index < 3;
    await serviceDb().execute(sql`
      insert into public.notion_states (
        user_id, notion_id, fsrs, mastery, first_seen_at, last_seen_at,
        in_review, gap_nature, gap_detected_at, gap_evidence, gap_cleared_at
      ) values (
        ${fx.userId}::uuid, ${notionId}::uuid,
        '{"due":"2026-11-12T12:20:00.000Z","stability":1,"difficulty":5,"elapsed_days":0,"scheduled_days":1,"reps":1,"lapses":0,"state":2,"last_review":"2026-11-11T12:20:00.000Z"}'::jsonb,
        ${gap ? index * 10 : 90}, ${FIXED.toISOString()}::timestamptz,
        ${FIXED.toISOString()}::timestamptz, true,
        ${gap ? natures[index] : null}::public.gap_nature,
        ${gap ? FIXED.toISOString() : null}::timestamptz,
        ${gap ? evidences[index] : null}, null
      )
    `);
  }
}

afterAll(async () => {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
  await closeDb();
  it('CA-4, CA-6, CA-7, CL-5, CL-9 — la remédiation prépare trois notions, se termine et alimente la révision', async () => {
    const fx = await fixture('remediation');
    await addGaps(fx);
    await failedAttempt(fx, 72);
    const prepared = await prepareRemediation(fx.ctx, fx.moduleIds[0] ?? '', {
      trigger: 'auto',
      scenario: 'remediation-plan',
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.status).toBe('ready');
    const replay = await prepareRemediation(fx.ctx, fx.moduleIds[0] ?? '', {
      trigger: 'auto',
      scenario: 'remediation-plan',
    });
    expect(replay.ok && replay.value.prepared).toBe(false);

    const current = await getRemediation(fx.ctx, fx.moduleIds[0] ?? '');
    expect(current.ok).toBe(true);
    if (!current.ok) return;
    expect(current.value.status).toBe('ready');
    expect(current.value.gaps).toHaveLength(3);
    expect(current.value.gaps[0]?.textMd).toContain('oppose');
    expect(current.value.gaps[1]?.textMd).toContain('ledger parallèle');
    const questions = current.value.gaps.flatMap((gap) => gap.questions);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.length).toBeLessThanOrEqual(6);
    const attemptId = current.value.attemptId ?? '';
    await serviceDb().execute(sql`
      update public.answers a
      set is_correct = true, score = a.max_score, graded_by = 'code',
          feedback = '{"title":"Exact.","explanation":"Vérifié."}'::jsonb
      where a.attempt_id = ${attemptId}::uuid
    `);
    const completed = await completeRemediation(fx.ctx, fx.moduleIds[0] ?? '');
    expect(completed.ok).toBe(true);
    const logs = await serviceDb().execute<{ count: number; source: string }>(sql`
      select count(*)::int as count, min(source::text) as source
      from public.review_logs
      where user_id = ${fx.userId}::uuid
    `);
    expect(logs[0]?.count ?? 0).toBeGreaterThan(0);
    expect(logs[0]?.source).toBe('validation');
    const after = await getRemediation(fx.ctx, fx.moduleIds[0] ?? '');
    expect(after.ok && after.value.status).toBe('completed');
  });

  it('CL-5 — un tuteur indisponible produit les textes de repli et les questions de la banque', async () => {
    const fx = await fixture('fallback');
    await addGaps(fx);
    await failedAttempt(fx, 72);
    const prepared = await prepareRemediation(fx.ctx, fx.moduleIds[0] ?? '', {
      trigger: 'auto',
      generator: () => Promise.resolve({ ok: false, error: new Error('panne') as never }),
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.fallback).toBe(true);
    const current = await getRemediation(fx.ctx, fx.moduleIds[0] ?? '');
    expect(current.ok).toBe(true);
    if (!current.ok) return;
    expect(current.value.gaps[0]?.textMd).toContain('Explication du tuteur indisponible');
  });

  it('CA-5 — automatisme 4 désactivé : aucune remédiation automatique et délai nul', async () => {
    const fx = await fixture('disabled');
    await addGaps(fx);
    await failedAttempt(fx, 72);
    await serviceDb().execute(sql`
      insert into public.automation_settings (user_id, key, enabled, params)
      values (${fx.userId}::uuid, 'remediation', false, '{"retryDelayHours":24,"mode":"required"}'::jsonb)
      on conflict (user_id, key) do update set enabled = false, params = excluded.params
    `);
    const prepared = await prepareRemediation(fx.ctx, fx.moduleIds[0] ?? '', {
      trigger: 'auto',
    });
    expect(prepared.ok && prepared.value.status).toBe('none');
    const started = await startValidationAttempt(fx.ctx, fx.moduleIds[0] ?? '');
    expect(started.ok).toBe(true);
  });
});

describe('[SPEC-612] résultat, déblocage et garde de délai', () => {
  it('CA-1, CA-7 — le résultat d’échec expose textes, lacunes, acquis, historique et action d’entraînement', async () => {
    const fx = await fixture('fail');
    await addGaps(fx);
    const attemptId = await failedAttempt(fx, 72);
    const result = await getQuizResult(fx.ctx, attemptId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.score).toBe(72);
    expect(result.value.pointsMissing).toBe(8);
    expect(result.value.passed).toBe(false);
    expect(result.value.gaps).toHaveLength(3);
    expect(result.value.gaps.map((gap) => gap.natureLabel)).toEqual([
      'Confusion',
      'Incompréhension',
      "Difficulté d'application",
    ]);
    expect(result.value.mastered).toHaveLength(9);
    expect(result.value.gaps[0]?.proposal).toBe('une question qui oppose les deux notions.');
    expect(result.value.gaps[2]?.proposal).toBe('un exercice pratique.');
    expect(result.value.history.map((entry) => entry.score)).toEqual([58, 72]);
    expect(result.value.retry.allowed).toBe(false);
    expect(result.value.retry.reason).toBe('delay');
  });

  it('CA-2, CA-5 — la garde refuse avant 24 h puis autorise au délai, puis le déblocage est idempotent', async () => {
    const fx = await fixture('gate');
    await failedAttempt(fx, 72);
    const blocked = await startValidationAttempt(fx.ctx, fx.moduleIds[0] ?? '');
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error.code).toBe('RETRY_NOT_YET_ALLOWED');
    expect(blocked.error.reason).toBe('delay');
    expect(blocked.error.availableAt).toBe('2026-11-12T12:20:00.000Z');

    fx.clock.current = new Date('2026-11-12T12:20:01Z');
    const allowed = await startValidationAttempt(fx.ctx, fx.moduleIds[0] ?? '');
    expect(allowed.ok).toBe(true);

    const attemptId = await failedAttempt(fx, 84, 3);
    const first = await unlockModule(fx.ctx, {
      userId: fx.userId,
      formationId: fx.formationId,
      moduleId: fx.moduleIds[0] ?? '',
      attemptId,
      score: 84,
      passed: true,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.unlocked).toBe(true);
    expect(first.value.nextModuleId).toBe(fx.moduleIds[1]);
    const second = await unlockModule(fx.ctx, {
      userId: fx.userId,
      formationId: fx.formationId,
      moduleId: fx.moduleIds[0] ?? '',
      attemptId,
      score: 84,
      passed: true,
    });
    expect(second.ok && second.value.revisionOnly).toBe(true);

    const rows = await serviceDb().execute<{
      progress: string;
      next_status: string;
      in_review: number;
      milestones: number;
      notifications: number;
      events: number;
    }>(sql`
      select
        (select status::text from public.module_progress
          where user_id = ${fx.userId}::uuid and module_id = ${fx.moduleIds[0]}::uuid) as progress,
        (select status::text from public.module_progress
          where user_id = ${fx.userId}::uuid and module_id = ${fx.moduleIds[1]}::uuid) as next_status,
        (select count(*)::int from public.notion_states
          where user_id = ${fx.userId}::uuid and in_review and notion_id = any(${`{${fx.notionIds.slice(0, 12).join(',')}}`}::uuid[])) as in_review,
        (select count(*)::int from public.milestones
          where user_id = ${fx.userId}::uuid and key = 'module_validated') as milestones,
        (select count(*)::int from public.notifications
          where user_id = ${fx.userId}::uuid and type = 'module_validated') as notifications,
        (select count(*)::int from public.event_outbox
          where name = 'module/validated' and data->>'userId' = ${fx.userId}) as events
    `);
    expect(rows[0]?.progress).toBe('validated');
    expect(rows[0]?.next_status).toBe('open');
    expect(rows[0]?.milestones).toBe(1);
    expect(rows[0]?.notifications).toBe(1);
    expect(rows[0]?.events).toBe(1);

    const last = await unlockModule(fx.ctx, {
      userId: fx.userId,
      formationId: fx.formationId,
      moduleId: fx.moduleIds[1] ?? '',
      attemptId,
      score: 90,
      passed: true,
    });
    expect(last.ok && last.value.formationCompleted).toBe(true);
    const completed = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.event_outbox
      where name = 'formation/completed' and data->>'userId' = ${fx.userId}
    `);
    expect(completed[0]?.count).toBe(1);
  });

  it('CA-5 — le mode obligatoire exige une remédiation terminée', () => {
    const base = {
      now: new Date('2026-11-12T12:20:00Z'),
      latest: {
        attemptId: 'attempt',
        passed: false,
        submittedAt: '2026-11-11T12:20:00Z',
      },
      remediationCompleted: false,
      inProgress: false,
    };
    expect(
      retryAvailability({
        ...base,
        settings: { enabled: true, delayHours: 24, mode: 'required' },
      }).reason,
    ).toBe('remediation_required');
    expect(
      retryAvailability({
        ...base,
        remediationCompleted: true,
        settings: { enabled: true, delayHours: 24, mode: 'required' },
      }).allowed,
    ).toBe(true);
    expect(
      retryAvailability({
        ...base,
        settings: { enabled: false, delayHours: 24, mode: 'advised' },
      }).allowed,
    ).toBe(true);
  });

  it('CA-5, CL-11 — les délais 0, 12, 24 et 48 heures et le point manquant sont exacts', () => {
    const now = new Date('2026-11-11T12:20:00Z');
    const latest = { attemptId: 'a', passed: false, submittedAt: now.toISOString() };
    expect(
      retryAvailability({
        now,
        latest,
        settings: { enabled: true, delayHours: 0, mode: 'advised' },
        remediationCompleted: false,
        inProgress: false,
      }).allowed,
    ).toBe(true);
    expect(
      retryAvailability({
        now,
        latest,
        settings: { enabled: true, delayHours: 12, mode: 'advised' },
        remediationCompleted: false,
        inProgress: false,
      }).reason,
    ).toBe('delay');
    expect(
      retryAvailability({
        now: new Date('2026-11-13T11:20:00Z'),
        latest,
        settings: { enabled: true, delayHours: 48, mode: 'advised' },
        remediationCompleted: false,
        inProgress: false,
      }).allowed,
    ).toBe(false);
  });
  it('CA-4, CA-6, CA-7, CL-5, CL-9 — la remédiation prépare trois notions, se termine et alimente la révision', async () => {
    const fx = await fixture('remediation');
    await addGaps(fx);
    await failedAttempt(fx, 72);
    const prepared = await prepareRemediation(fx.ctx, fx.moduleIds[0] ?? '', {
      trigger: 'auto',
      scenario: 'remediation-plan',
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.status).toBe('ready');
    const replay = await prepareRemediation(fx.ctx, fx.moduleIds[0] ?? '', {
      trigger: 'auto',
      scenario: 'remediation-plan',
    });
    expect(replay.ok && replay.value.prepared).toBe(false);

    const current = await getRemediation(fx.ctx, fx.moduleIds[0] ?? '');
    expect(current.ok).toBe(true);
    if (!current.ok) return;
    expect(current.value.status).toBe('ready');
    expect(current.value.gaps).toHaveLength(3);
    expect(current.value.gaps[0]?.textMd).toContain('oppose');
    expect(current.value.gaps[1]?.textMd).toContain('ledger parallèle');
    const questions = current.value.gaps.flatMap((gap) => gap.questions);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.length).toBeLessThanOrEqual(6);
    const attemptId = current.value.attemptId ?? '';
    await serviceDb().execute(sql`
      update public.answers a
      set is_correct = true, score = a.max_score, graded_by = 'code',
          feedback = '{"title":"Exact.","explanation":"Vérifié."}'::jsonb
      where a.attempt_id = ${attemptId}::uuid
    `);
    const completed = await completeRemediation(fx.ctx, fx.moduleIds[0] ?? '');
    expect(completed.ok).toBe(true);
    const logs = await serviceDb().execute<{ count: number; source: string }>(sql`
      select count(*)::int as count, min(source::text) as source
      from public.review_logs
      where user_id = ${fx.userId}::uuid
    `);
    expect(logs[0]?.count ?? 0).toBeGreaterThan(0);
    expect(logs[0]?.source).toBe('validation');
    const after = await getRemediation(fx.ctx, fx.moduleIds[0] ?? '');
    expect(after.ok && after.value.status).toBe('completed');
  });

  it('CL-5 — un tuteur indisponible produit les textes de repli et les questions de la banque', async () => {
    const fx = await fixture('fallback');
    await addGaps(fx);
    await failedAttempt(fx, 72);
    const prepared = await prepareRemediation(fx.ctx, fx.moduleIds[0] ?? '', {
      trigger: 'auto',
      generator: () => Promise.resolve({ ok: false, error: new Error('panne') as never }),
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.fallback).toBe(true);
    const current = await getRemediation(fx.ctx, fx.moduleIds[0] ?? '');
    expect(current.ok).toBe(true);
    if (!current.ok) return;
    expect(current.value.gaps[0]?.textMd).toContain('Explication du tuteur indisponible');
  });

  it('CA-5 — automatisme 4 désactivé : aucune remédiation automatique et délai nul', async () => {
    const fx = await fixture('disabled');
    await addGaps(fx);
    await failedAttempt(fx, 72);
    await serviceDb().execute(sql`
      insert into public.automation_settings (user_id, key, enabled, params)
      values (${fx.userId}::uuid, 'remediation', false, '{"retryDelayHours":24,"mode":"required"}'::jsonb)
      on conflict (user_id, key) do update set enabled = false, params = excluded.params
    `);
    const prepared = await prepareRemediation(fx.ctx, fx.moduleIds[0] ?? '', {
      trigger: 'auto',
    });
    expect(prepared.ok && prepared.value.status).toBe('none');
    const started = await startValidationAttempt(fx.ctx, fx.moduleIds[0] ?? '');
    expect(started.ok).toBe(true);
  });
});
