// Integration tests of the AI/billing schema (SPEC-110 §12): introspection, SQL constraints,
// encrypted key storage, task-model resolution, local-day aggregation (midnight, DST, time-zone
// change), public redaction, usage grouping, subscription defaults, RLS with two real JWTs and
// cascade behaviour. Every test runs against the local Supabase database (testing.md §3).
// The clock is fixed at 2026-11-11T12:20:00Z (ADR-0047).
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';

import { closeDb, serviceDb, userDb, type DbTx } from '../../src/client';
import {
  createCredential,
  deleteCredential,
  getCredentialSecret,
  getSpendToday,
  getSubscription,
  getTaskModel,
  hasActiveSubscription,
  listAiCalls,
  listAiUsage,
  listCredentials,
  listTaskModels,
  recordAiCall,
  resolveTaskModel,
  setTaskModel,
  upsertSubscription,
} from '../../src/repositories/ai-usage';
import { createTestProgramme, createTestUser, withRollback } from '../../src/testing';

interface Row {
  [key: string]: unknown;
}

const FIXED = new Date('2026-11-11T12:20:00Z');
const NEXT_PERIOD = new Date('2026-12-11T12:20:00Z');

const ENCRYPTED_KEY = (() => {
  const iv = Buffer.alloc(12, 0x11);
  const tag = Buffer.alloc(16, 0x22);
  const ciphertext = Buffer.from('learny-test-only');
  return Buffer.concat([iv, tag, ciphertext]);
})();

const TABLES = ['ai_calls', 'ai_credentials', 'ai_task_models', 'subscriptions'];

const ENUMS: Record<string, string[]> = {
  ai_provider: ['anthropic', 'openai', 'mistral', 'deepseek', 'openai_compatible', 'local'],
  credential_status: ['untested', 'qualified', 'failed'],
  ai_task: ['programme', 'course', 'gaps', 'tutor', 'light'],
  ai_call_status: ['ok', 'error', 'refused', 'capped', 'invalid_output'],
  subscription_status: ['none', 'active', 'past_due', 'canceled', 'incomplete'],
};

let savepoint = 0;

interface Failure {
  code: string;
  message: string;
}

function failureOf(error: unknown): Failure {
  let current: unknown = error;
  let code = 'unknown';
  const messages: string[] = [];
  for (let depth = 0; depth < 5 && current !== null && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (code === 'unknown' && typeof candidate.code === 'string') code = candidate.code;
    if (typeof candidate.message === 'string') messages.push(candidate.message);
    current = candidate.cause;
  }
  return { code, message: messages.join(' | ') };
}

async function attempt(tx: DbTx, run: () => Promise<unknown>): Promise<Failure> {
  savepoint += 1;
  const name = `spec110_${String(savepoint)}`;
  await tx.execute(sql.raw(`savepoint ${name}`));
  try {
    await run();
    await tx.execute(sql.raw(`release savepoint ${name}`));
    return { code: '00000', message: '' };
  } catch (error) {
    await tx.execute(sql.raw(`rollback to savepoint ${name}`));
    await tx.execute(sql.raw(`release savepoint ${name}`));
    return failureOf(error);
  }
}

async function failureOfUserDb(
  fn: (tx: DbTx) => Promise<unknown>,
  userId: string,
): Promise<Failure> {
  try {
    await userDb({ userId }).run(fn);
    return { code: '00000', message: '' };
  } catch (error) {
    return failureOf(error);
  }
}

async function baseUser(tx: DbTx, timezone = 'Europe/Paris') {
  const user = await createTestUser(tx, { timezone });
  const programme = await createTestProgramme(tx, user.id, {
    modules: 1,
    chaptersPerModule: 1,
    notionsPerChapter: 1,
  });
  return { userId: user.id, formationId: programme.formationId };
}

interface CallSeed {
  userId: string;
  formationId?: string | null;
  createdAt: Date;
  costUsd: string;
  managed?: boolean;
  status?: string;
  task?: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
}

async function insertCall(tx: DbTx, seed: CallSeed): Promise<void> {
  await tx.execute(sql`
    insert into public.ai_calls (
      user_id, formation_id, task, provider, model, managed,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
      cost_usd, latency_ms, status, error_code, batch, created_at
    ) values (
      ${seed.userId}::uuid,
      ${seed.formationId ?? null}::uuid,
      ${seed.task ?? 'tutor'}::public.ai_task,
      ${seed.provider ?? 'anthropic'}::public.ai_provider,
      'claude-haiku-4-5-20251001',
      ${seed.managed ?? true},
      ${seed.inputTokens ?? 100},
      ${seed.outputTokens ?? 50},
      0,
      0,
      ${seed.costUsd}::numeric(12, 6),
      120,
      ${seed.status ?? 'ok'}::public.ai_call_status,
      null,
      false,
      ${seed.createdAt.toISOString()}::timestamptz
    )
  `);
}

async function credentialId(
  tx: DbTx,
  userId: string,
  status: 'untested' | 'qualified' | 'failed' = 'qualified',
): Promise<string> {
  const { id } = await createCredential(tx, {
    userId,
    provider: 'anthropic',
    label: 'Claude personnelle',
    modelIds: ['claude-haiku-4-5-20251001'],
    encryptedKey: ENCRYPTED_KEY,
    keyLast4: 'a1b2',
    status,
    qualification: { latencyMs: 120 },
    outsideEu: false,
  });
  return id;
}

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-110] AI billing persistence', () => {
  it('CA-1 — les quatre tables, cinq énumérations, contraintes, index, déclencheurs et politiques existent', async () => {
    const db = serviceDb();
    const tables = await db.execute<Row>(sql`
      select tablename, rowsecurity
      from pg_tables
      where schemaname = 'public' and tablename in ${sql.raw(`('${TABLES.join("','")}')`)}
      order by tablename
    `);
    expect(tables.map((row) => String(row.tablename))).toEqual(TABLES);
    expect(tables.every((row) => row.rowsecurity === true)).toBe(true);

    for (const [name, values] of Object.entries(ENUMS)) {
      const labels = await db.execute<Row>(
        sql`select array_agg(e.enumlabel order by e.enumsortorder)::text[] as labels
            from pg_enum e join pg_type t on t.oid = e.enumtypid
            where t.typname = ${name}`,
      );
      expect(labels[0]?.labels, name).toEqual(values);
    }

    const callColumns = await db.execute<Row>(sql`
      select column_name, data_type, numeric_precision, numeric_scale, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public' and table_name = 'ai_calls'
    `);
    const byName = new Map(callColumns.map((row) => [String(row.column_name), row]));
    expect(byName.get('cost_usd')).toMatchObject({
      data_type: 'numeric',
      numeric_precision: 12,
      numeric_scale: 6,
      is_nullable: 'NO',
    });
    expect(byName.get('input_tokens')).toMatchObject({ data_type: 'integer', is_nullable: 'NO' });
    expect(byName.get('latency_ms')).toMatchObject({ data_type: 'integer', is_nullable: 'NO' });
    expect(byName.get('created_at')).toMatchObject({
      data_type: 'timestamp with time zone',
      is_nullable: 'NO',
      column_default: 'now()',
    });

    const subColumns = await db.execute<Row>(sql`
      select column_name, column_default, numeric_precision, numeric_scale
      from information_schema.columns
      where table_schema = 'public' and table_name = 'subscriptions'
    `);
    const subByName = new Map(subColumns.map((row) => [String(row.column_name), row]));
    expect(subByName.get('daily_cap_usd')).toMatchObject({
      column_default: '1.5',
      numeric_precision: 12,
      numeric_scale: 6,
    });

    const indexes = await db.execute<Row>(sql`
      select indexname, indexdef from pg_indexes
      where schemaname = 'public' and tablename in ('ai_calls', 'ai_credentials')
      order by indexname
    `);
    const indexText = JSON.stringify(indexes);
    expect(indexText).toContain('ai_calls_user_id_created_at_idx');
    expect(indexText).toContain('(user_id, created_at)');

    const policies = await db.execute<Row>(sql`
      select tablename, policyname, cmd
      from pg_policies
      where schemaname = 'public' and tablename in (${sql.raw(`'${TABLES.join("','")}'`)})
      order by tablename, policyname
    `);
    expect(
      policies.map(
        (row) => `${String(row.tablename)}:${String(row.policyname)}:${String(row.cmd)}`,
      ),
    ).toEqual([
      'ai_calls:ai_calls_owner_select:SELECT',
      'ai_credentials:ai_credentials_owner_all:ALL',
      'ai_task_models:ai_task_models_owner_all:ALL',
      'subscriptions:subscriptions_owner_select:SELECT',
    ]);

    const triggers = await db.execute<Row>(sql`
      select distinct event_object_table as table_name, trigger_name
      from information_schema.triggers
      where trigger_schema = 'public'
        and event_object_table in (${sql.raw(`'${TABLES.join("','")}'`)})
        and trigger_name in ('set_updated_at', 'ai_task_models_credential_owner')
      order by event_object_table, trigger_name
    `);
    expect(triggers.map((row) => `${String(row.table_name)}:${String(row.trigger_name)}`)).toEqual([
      'ai_credentials:set_updated_at',
      'ai_task_models:ai_task_models_credential_owner',
      'subscriptions:set_updated_at',
    ]);

    const view = await db.execute<Row>(sql`
      select c.reloptions,
             pg_get_viewdef(c.oid) as definition
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'ai_spend_today'
    `);
    // `profiles` has no authenticated policy yet (SPEC-102): the view filters JWT claims itself
    // (ADR-0245) instead of relying on `security_invoker`.
    expect(JSON.stringify(view[0]?.reloptions)).not.toContain('security_invoker=true');
    expect(String(view[0]?.definition)).toContain('ai_spend_today');

    const functionRow = await db.execute<Row>(sql`
      select p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ai_spend_today'
    `);
    expect(functionRow[0]?.args).toBe('p_user_id uuid, p_now timestamp with time zone');

    const fks = await db.execute<Row>(sql`
      select conname, confdeltype
      from pg_constraint
      where conrelid = 'public.ai_task_models'::regclass and contype = 'f'
      order by conname
    `);
    const credentialFk = fks.find((row) => String(row.conname).includes('credential_id'));
    expect(credentialFk?.confdeltype).toBe('n');

    const uniques = await db.execute<Row>(sql`
      select conname from pg_constraint
      where conrelid = 'public.subscriptions'::regclass and contype = 'u'
      order by conname
    `);
    expect(uniques.map((row) => String(row.conname))).toEqual([
      'subscriptions_stripe_customer_id_unique',
      'subscriptions_stripe_subscription_id_unique',
    ]);
  });

  it('CA-1 / CL-2 — les contraintes SQL refusent coûts, tokens, latence, clés et plafonds invalides', async () => {
    await withRollback(async (tx) => {
      const base = await baseUser(tx);
      const other = await baseUser(tx);

      const negativeCost = await attempt(tx, () =>
        insertCall(tx, { userId: base.userId, createdAt: FIXED, costUsd: '-0.000001' }),
      );
      expect(negativeCost.code).toBe('23514');
      expect(negativeCost.message).toContain('ai_calls_cost_usd_check');

      const negativeTokens = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.ai_calls (user_id, task, provider, model, status, input_tokens)
          values (${base.userId}::uuid, 'tutor', 'anthropic', 'm', 'ok', -1)
        `),
      );
      expect(negativeTokens.code).toBe('23514');
      expect(negativeTokens.message).toContain('ai_calls_input_tokens_check');

      const negativeLatency = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.ai_calls (user_id, task, provider, model, status, latency_ms)
          values (${base.userId}::uuid, 'tutor', 'anthropic', 'm', 'ok', -1)
        `),
      );
      expect(negativeLatency.code).toBe('23514');
      expect(negativeLatency.message).toContain('ai_calls_latency_ms_check');

      // CL-1 — a hosted provider cannot exist without a ciphertext, and a raw text key has no
      // column at all: only the bytea layout is accepted.
      const missingKey = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.ai_credentials (user_id, provider, label)
          values (${base.userId}::uuid, 'anthropic', 'Sans clé')
        `),
      );
      expect(missingKey.code).toBe('23514');
      expect(missingKey.message).toContain('ai_credentials_key_required_check');

      const shortKey = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.ai_credentials (user_id, provider, label, encrypted_key, key_last4)
          values (${base.userId}::uuid, 'anthropic', 'Trop court', ${Buffer.alloc(28)}::bytea, 'a1b2')
        `),
      );
      expect(shortKey.code).toBe('23514');
      expect(shortKey.message).toContain('ai_credentials_encrypted_key_check');

      const wrongLast4 = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.ai_credentials (user_id, provider, label, encrypted_key, key_last4)
          values (${base.userId}::uuid, 'anthropic', 'Last4', ${ENCRYPTED_KEY}::bytea, 'abc')
        `),
      );
      expect(wrongLast4.code).toBe('23514');
      expect(wrongLast4.message).toContain('ai_credentials_key_last4_check');

      // CL-1 — a local model may run without a key; the default qualification report is an object.
      const local = await createCredential(tx, {
        userId: base.userId,
        provider: 'local',
        label: 'Modèle local',
      });
      const [localRow] = await tx.execute<Row>(
        sql`select encrypted_key, key_last4, qualification from public.ai_credentials where id = ${local.id}::uuid`,
      );
      expect(localRow?.encrypted_key).toBeNull();
      expect(localRow?.key_last4).toBeNull();
      expect(localRow?.qualification).toEqual({});

      // CA-4 — subscription cap, status and unique Stripe identifiers.
      const zeroCap = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.subscriptions (user_id, status, daily_cap_usd)
          values (${base.userId}::uuid, 'none', 0)
        `),
      );
      expect(zeroCap.code).toBe('23514');
      expect(zeroCap.message).toContain('subscriptions_daily_cap_usd_check');

      const invalidStatus = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.subscriptions (user_id, status) values (${base.userId}::uuid, 'paused')
        `),
      );
      expect(invalidStatus.code).toBe('22P02');

      await tx.execute(sql`
        insert into public.subscriptions (user_id, stripe_customer_id, status)
        values (${base.userId}::uuid, 'cus_shared', 'active')
      `);
      const duplicateCustomer = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.subscriptions (user_id, stripe_customer_id, status)
          values (${other.userId}::uuid, 'cus_shared', 'active')
        `),
      );
      expect(duplicateCustomer.code).toBe('23505');
    });
  });

  it('CA-3 / CL-7 / ET-2 — le chiffré reste en base, la projection publique ne le contient jamais', async () => {
    await withRollback(async (tx) => {
      const base = await baseUser(tx);
      const id = await credentialId(tx, base.userId, 'qualified');

      const [stored] = await tx.execute<Row>(sql`
        select encode(encrypted_key, 'escape') as secret, octet_length(encrypted_key) as size
        from public.ai_credentials where id = ${id}::uuid
      `);
      expect(String(stored?.secret)).toContain('learny-test-only');
      expect(Number(stored?.size)).toBe(ENCRYPTED_KEY.length);

      const publicRows = await listCredentials(tx, base.userId);
      expect(publicRows).toHaveLength(1);
      expect(Object.keys(publicRows[0] ?? {}).sort()).toEqual([
        'keyLast4',
        'label',
        'outsideEu',
        'provider',
        'status',
      ]);
      const serialised = JSON.stringify(publicRows);
      expect(serialised).not.toContain('learny-test-only');
      expect(serialised).not.toContain('encrypted');
      expect(serialised).not.toContain('bytea');

      const secret = await getCredentialSecret(tx, {
        userId: base.userId,
        credentialId: id,
      });
      expect(secret?.provider).toBe('anthropic');
      expect(Buffer.from(secret?.encryptedKey ?? []).toString()).toContain('learny-test-only');

      // The encrypted payload is the only key material; a text lookup never matches.
      const textLookup = await tx.execute<Row>(sql`
        select count(*)::int as found from public.ai_credentials
        where label = 'sk-ant-api03-learntest'
      `);
      expect(textLookup[0]?.found).toBe(0);
    });
  });

  it('EF-2 / CL-7 — une clé supprimée ou non qualifiée n’est jamais choisie, et la FK libère la tâche', async () => {
    await withRollback(async (tx) => {
      const base = await baseUser(tx);
      const id = await credentialId(tx, base.userId, 'untested');
      await setTaskModel(tx, {
        userId: base.userId,
        task: 'tutor',
        credentialId: id,
        modelId: 'claude-haiku-4-5-20251001',
      });

      const unqualified = await resolveTaskModel(tx, { userId: base.userId, task: 'tutor' });
      expect(unqualified).toEqual({
        task: 'tutor',
        managed: true,
        credentialId: null,
        modelId: null,
        unavailableCredentialId: id,
      });
      const listed = await listTaskModels(tx, base.userId);
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
        managed: true,
        usable: false,
        credentialStatus: 'untested',
      });

      await tx.execute(
        sql`update public.ai_credentials set status = 'qualified' where id = ${id}::uuid`,
      );
      const qualified = await resolveTaskModel(tx, { userId: base.userId, task: 'tutor' });
      expect(qualified).toEqual({
        task: 'tutor',
        managed: false,
        credentialId: id,
        modelId: 'claude-haiku-4-5-20251001',
        unavailableCredentialId: null,
      });
      expect((await getTaskModel(tx, { userId: base.userId, task: 'tutor' }))?.usable).toBe(true);

      await tx.execute(
        sql`update public.ai_credentials set status = 'failed' where id = ${id}::uuid`,
      );
      expect((await resolveTaskModel(tx, { userId: base.userId, task: 'tutor' })).managed).toBe(
        true,
      );

      await tx.execute(
        sql`update public.ai_credentials set status = 'qualified' where id = ${id}::uuid`,
      );
      expect(await deleteCredential(tx, { userId: base.userId, credentialId: id })).toBe(true);
      // CL-7 — the FK `on delete set null` removes the reference instead of dangling.
      const [taskRow] = await tx.execute<Row>(sql`
        select credential_id from public.ai_task_models
        where user_id = ${base.userId}::uuid and task = 'tutor'
      `);
      expect(taskRow?.credential_id).toBeNull();
      expect((await resolveTaskModel(tx, { userId: base.userId, task: 'tutor' })).managed).toBe(
        true,
      );

      // A foreign credential is refused by the repository and by the ownership trigger.
      const other = await baseUser(tx);
      const foreignId = await credentialId(tx, other.userId, 'qualified');
      await expect(
        setTaskModel(tx, {
          userId: base.userId,
          task: 'course',
          credentialId: foreignId,
          modelId: 'claude-sonnet-4-5-20250929',
        }),
      ).rejects.toThrow(AppError);
      const foreign = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.ai_task_models (user_id, task, credential_id, model_id)
          values (${base.userId}::uuid, 'light', ${foreignId}::uuid, 'claude-haiku-4-5-20251001')
        `),
      );
      expect(foreign.code).toBe('23514');
      expect(foreign.message).toContain('ai_task_model_credential_owner_mismatch');
    });
  });

  it('CA-2 / ET-3 / CL-3 / CL-4 / CL-6 — la dépense suit le jour local de Paris, minuit et les bornes UTC', async () => {
    await withRollback(async (tx) => {
      const base = await baseUser(tx);

      // Local day in Paris on 2026-11-11: 2026-11-10T23:00Z .. 2026-11-11T23:00Z.
      await insertCall(tx, {
        userId: base.userId,
        createdAt: new Date('2026-11-10T23:00:00.000Z'), // exactly local midnight
        costUsd: '0.050000',
      });
      await insertCall(tx, {
        userId: base.userId,
        createdAt: new Date('2026-11-10T23:10:00.000Z'), // 00:10 local
        costUsd: '0.400000',
      });
      await insertCall(tx, {
        userId: base.userId,
        createdAt: new Date('2026-11-11T10:00:00.000Z'), // 11:00 local
        costUsd: '0.100000',
      });
      await insertCall(tx, {
        userId: base.userId,
        createdAt: new Date('2026-11-11T22:50:00.000Z'), // 23:50 local
        costUsd: '0.200000',
      });
      await insertCall(tx, {
        userId: base.userId,
        createdAt: new Date('2026-11-11T12:00:00.000Z'), // BYOK, excluded from the cap
        costUsd: '0.500000',
        managed: false,
      });
      await insertCall(tx, {
        userId: base.userId,
        createdAt: new Date('2026-11-11T12:05:00.000Z'), // refusal, zero provider call
        costUsd: '0.000000',
        status: 'refused',
      });
      await insertCall(tx, {
        userId: base.userId,
        createdAt: new Date('2026-11-10T22:30:00.000Z'), // previous local day
        costUsd: '0.800000',
      });
      await insertCall(tx, {
        userId: base.userId,
        createdAt: new Date('2026-11-11T23:00:00.000Z'), // exactly next local midnight
        costUsd: '0.900000',
      });

      expect(await getSpendToday(tx, { userId: base.userId, now: FIXED })).toBe('0.750000');
      expect(
        await getSpendToday(tx, {
          userId: base.userId,
          now: new Date('2026-11-10T22:59:59.000Z'),
        }),
      ).toBe('0.800000');

      // CL-4 — two calls recorded at the same instant both stay in the aggregate.
      await insertCall(tx, {
        userId: base.userId,
        createdAt: new Date('2026-11-11T10:30:00.000Z'),
        costUsd: '0.010000',
      });
      await insertCall(tx, {
        userId: base.userId,
        createdAt: new Date('2026-11-11T10:30:00.000Z'),
        costUsd: '0.020000',
      });
      expect(await getSpendToday(tx, { userId: base.userId, now: FIXED })).toBe('0.780000');

      // EF-5 — the view uses the same local-day function, on a learner dedicated to this check.
      const viewUser = await baseUser(tx);
      await tx.execute(sql`
        insert into public.ai_calls (user_id, task, provider, model, managed, cost_usd, status, created_at)
        values (
          ${viewUser.userId}::uuid, 'light', 'anthropic', 'claude-haiku-4-5-20251001', true, 0.330000, 'ok',
          (((now() at time zone 'Europe/Paris')::date + time '12:00') at time zone 'Europe/Paris')
        )
      `);
      const [viewRow] = await tx.execute<Row>(sql`
        select spent_usd::text as spent_usd from public.ai_spend_today
        where user_id = ${viewUser.userId}::uuid
      `);
      expect(viewRow?.spent_usd).toBe('0.330000');
    });
  });

  it('CA-2 / CL-5 / CL-6 — changement d’heure et changement de fuseau du profil', async () => {
    await withRollback(async (tx) => {
      const paris = await baseUser(tx);

      // Fall back: 2026-10-25 is 25 hours long in Paris (00:00 CEST .. 00:00 CET next day).
      await insertCall(tx, {
        userId: paris.userId,
        createdAt: new Date('2026-10-24T22:30:00.000Z'), // 00:30 local (CEST)
        costUsd: '0.100000',
      });
      await insertCall(tx, {
        userId: paris.userId,
        createdAt: new Date('2026-10-25T22:30:00.000Z'), // 23:30 local (CET)
        costUsd: '0.200000',
      });
      await insertCall(tx, {
        userId: paris.userId,
        createdAt: new Date('2026-10-25T23:30:00.000Z'), // 00:30 next local day
        costUsd: '0.400000',
      });
      await insertCall(tx, {
        userId: paris.userId,
        createdAt: new Date('2026-10-24T21:30:00.000Z'), // 23:30 previous local day
        costUsd: '0.800000',
      });
      expect(
        await getSpendToday(tx, {
          userId: paris.userId,
          now: new Date('2026-10-25T12:00:00.000Z'),
        }),
      ).toBe('0.300000');

      // Spring forward: 2026-03-29 is 23 hours long (00:00 CET .. 00:00 CEST next day).
      await insertCall(tx, {
        userId: paris.userId,
        createdAt: new Date('2026-03-28T23:30:00.000Z'), // 00:30 local (CET)
        costUsd: '0.050000',
      });
      await insertCall(tx, {
        userId: paris.userId,
        createdAt: new Date('2026-03-29T21:30:00.000Z'), // 23:30 local (CEST)
        costUsd: '0.070000',
      });
      await insertCall(tx, {
        userId: paris.userId,
        createdAt: new Date('2026-03-29T22:30:00.000Z'), // 00:30 next local day
        costUsd: '0.400000',
      });
      await insertCall(tx, {
        userId: paris.userId,
        createdAt: new Date('2026-03-28T22:30:00.000Z'), // 23:30 previous local day
        costUsd: '0.800000',
      });
      expect(
        await getSpendToday(tx, {
          userId: paris.userId,
          now: new Date('2026-03-29T12:00:00.000Z'),
        }),
      ).toBe('0.120000');

      // CL-5 — the read uses the current profile time zone; the journal keeps its UTC instant.
      const moved = await baseUser(tx, 'Europe/Paris');
      await insertCall(tx, {
        userId: moved.userId,
        createdAt: new Date('2026-11-11T23:30:00.000Z'),
        costUsd: '0.250000',
      });
      const now = new Date('2026-11-12T12:00:00.000Z');
      expect(await getSpendToday(tx, { userId: moved.userId, now })).toBe('0.250000');
      await tx.execute(
        sql`update public.profiles set timezone = 'America/New_York' where id = ${moved.userId}::uuid`,
      );
      expect(await getSpendToday(tx, { userId: moved.userId, now })).toBe('0.000000');
      const [instant] = await tx.execute<Row>(sql`
        select created_at from public.ai_calls where user_id = ${moved.userId}::uuid
      `);
      expect(new Date(String(instant?.created_at)).toISOString()).toBe('2026-11-11T23:30:00.000Z');
      await tx.execute(
        sql`update public.profiles set timezone = 'Europe/Paris' where id = ${moved.userId}::uuid`,
      );
      expect(await getSpendToday(tx, { userId: moved.userId, now })).toBe('0.250000');
    });
  });

  it('CA-3 / CL-8 — deux JWT ne lisent ni n’écrivent les clés, appels et abonnements de l’autre', async () => {
    const alice = await serviceDb().transaction(async (tx) => {
      const base = await baseUser(tx);
      const id = await credentialId(tx, base.userId, 'qualified');
      await setTaskModel(tx, {
        userId: base.userId,
        task: 'tutor',
        credentialId: id,
        modelId: 'claude-haiku-4-5-20251001',
      });
      await upsertSubscription(tx, {
        userId: base.userId,
        stripeCustomerId: 'cus_alice',
        stripeSubscriptionId: 'sub_alice',
        status: 'active',
        currentPeriodEnd: NEXT_PERIOD,
        dailyCapUsd: '1.5',
      });
      await recordAiCall(tx, {
        userId: base.userId,
        formationId: base.formationId,
        task: 'tutor',
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        managed: true,
        costUsd: '0.250000',
        latencyMs: 100,
        status: 'ok',
        createdAt: FIXED,
      });
      return { ...base, credentialId: id };
    });

    const bob = await serviceDb().transaction(async (tx) => {
      const base = await baseUser(tx);
      const id = await credentialId(tx, base.userId, 'qualified');
      await upsertSubscription(tx, {
        userId: base.userId,
        stripeCustomerId: 'cus_bob',
        status: 'none',
      });
      await recordAiCall(tx, {
        userId: base.userId,
        task: 'course',
        provider: 'openai',
        model: 'gpt-5-mini',
        managed: true,
        costUsd: '0.300000',
        latencyMs: 90,
        status: 'ok',
        createdAt: FIXED,
      });
      return { ...base, credentialId: id };
    });

    try {
      const aliceView = await userDb({ userId: alice.userId }).run(async (tx) => ({
        credentials: await listCredentials(tx, alice.userId),
        foreignCredentials: await listCredentials(tx, bob.userId),
        tasks: await listTaskModels(tx, alice.userId),
        calls: await listAiCalls(tx, { userId: alice.userId }),
        subscription: await getSubscription(tx, alice.userId),
        spend: await getSpendToday(tx, { userId: alice.userId, now: FIXED }),
        foreignSpend: await getSpendToday(tx, { userId: bob.userId, now: FIXED }),
        foreignSecret: await getCredentialSecret(tx, {
          userId: alice.userId,
          credentialId: bob.credentialId,
        }),
      }));
      expect(aliceView.credentials).toHaveLength(1);
      expect(aliceView.foreignCredentials).toEqual([]);
      expect(aliceView.tasks).toHaveLength(1);
      expect(aliceView.tasks[0]?.usable).toBe(true);
      expect(aliceView.calls).toHaveLength(1);
      expect(aliceView.subscription?.stripeCustomerId).toBe('cus_alice');
      expect(aliceView.spend).toBe('0.250000');
      expect(aliceView.foreignSpend).toBe('0.000000');
      expect(aliceView.foreignSecret).toBeNull();

      const bobView = await userDb({ userId: bob.userId }).run(async (tx) => ({
        credentials: await listCredentials(tx, bob.userId),
        tasks: await listTaskModels(tx, bob.userId),
        calls: await listAiCalls(tx, { userId: bob.userId }),
        subscription: await getSubscription(tx, bob.userId),
        spend: await getSpendToday(tx, { userId: bob.userId, now: FIXED }),
      }));
      expect(bobView.credentials).toHaveLength(1);
      expect(bobView.tasks).toEqual([]);
      expect(bobView.calls).toHaveLength(1);
      expect(bobView.subscription?.stripeCustomerId).toBe('cus_bob');
      expect(bobView.spend).toBe('0.300000');

      // A second account cannot read the ciphertext by UUID.
      const leaked = await userDb({ userId: bob.userId }).run((tx) =>
        tx.execute<Row>(sql`
          select encode(encrypted_key, 'escape') as secret from public.ai_credentials
          where user_id = ${alice.userId}::uuid
        `),
      );
      expect(leaked).toEqual([]);

      // CL-8 — own credentials are writable; a foreign row is not.
      const own = await userDb({ userId: alice.userId }).run((tx) =>
        createCredential(tx, {
          userId: alice.userId,
          provider: 'local',
          label: 'Local après JWT',
        }),
      );
      expect(own.id).toMatch(/^[0-9a-f-]{36}$/);
      const foreignDelete = await userDb({ userId: bob.userId }).run((tx) =>
        deleteCredential(tx, { userId: bob.userId, credentialId: alice.credentialId }),
      );
      expect(foreignDelete).toBe(false);

      // Journal and subscription writes remain service-only (ADR-0112 §4, ADR-0215).
      const forbiddenCall = await failureOfUserDb(
        (tx) =>
          tx.execute(sql`
            insert into public.ai_calls (user_id, task, provider, model, status)
            values (${alice.userId}::uuid, 'tutor', 'anthropic', 'm', 'ok')
          `),
        alice.userId,
      );
      expect(forbiddenCall.code).toBe('42501');
      const forbiddenSubscription = await failureOfUserDb(
        (tx) =>
          tx.execute(sql`
            insert into public.subscriptions (user_id, status)
            values (${alice.userId}::uuid, 'active')
          `),
        alice.userId,
      );
      expect(forbiddenSubscription.code).toBe('42501');
      const foreignSubscriptionUpdate = await userDb({ userId: alice.userId }).run((tx) =>
        tx.execute<Row>(sql`
          update public.subscriptions set status = 'canceled'
          where user_id = ${bob.userId}::uuid
          returning user_id::text as user_id
        `),
      );
      expect(foreignSubscriptionUpdate).toEqual([]);
    } finally {
      await serviceDb().execute(sql`delete from auth.users where id = ${alice.userId}::uuid`);
      await serviceDb().execute(sql`delete from auth.users where id = ${bob.userId}::uuid`);
    }
  });

  it('CA-4 — un abonnement neuf a le plafond 1,50 USD et les cinq statuts autorisés', async () => {
    await withRollback(async (tx) => {
      const base = await baseUser(tx);
      const created = await upsertSubscription(tx, { userId: base.userId });
      expect(created.status).toBe('none');
      expect(created.dailyCapUsd).toBe('1.500000');
      expect(created.stripeCustomerId).toBeNull();
      expect(created.stripeSubscriptionId).toBeNull();
      expect(hasActiveSubscription(created, FIXED)).toBe(false);

      const active = await upsertSubscription(tx, {
        userId: base.userId,
        stripeCustomerId: 'cus_active',
        stripeSubscriptionId: 'sub_active',
        status: 'active',
        currentPeriodEnd: NEXT_PERIOD,
        dailyCapUsd: '2.25',
      });
      expect(active.dailyCapUsd).toBe('2.250000');
      expect(active.status).toBe('active');
      expect(hasActiveSubscription(active, FIXED)).toBe(true);
      expect(hasActiveSubscription(active, new Date('2026-12-12T00:00:00Z'))).toBe(false);
      expect(hasActiveSubscription({ ...active, status: 'past_due' }, FIXED)).toBe(false);
      expect(hasActiveSubscription({ ...active, currentPeriodEnd: null }, FIXED)).toBe(false);
    });
  });

  it('EF-6 — l’usage se liste par jour local et formation sans aucune donnée de clé', async () => {
    await withRollback(async (tx) => {
      const base = await baseUser(tx);
      await insertCall(tx, {
        userId: base.userId,
        formationId: base.formationId,
        createdAt: new Date('2026-11-11T09:00:00.000Z'), // 10:00 local
        costUsd: '0.100000',
        inputTokens: 100,
        outputTokens: 50,
      });
      await insertCall(tx, {
        userId: base.userId,
        formationId: null,
        createdAt: new Date('2026-11-11T10:00:00.000Z'), // 11:00 local
        costUsd: '0.050000',
        task: 'light',
      });
      await insertCall(tx, {
        userId: base.userId,
        formationId: base.formationId,
        createdAt: new Date('2026-11-12T08:00:00.000Z'), // 09:00 local next day, BYOK
        costUsd: '0.200000',
        managed: false,
        task: 'course',
      });
      await insertCall(tx, {
        userId: base.userId,
        formationId: base.formationId,
        createdAt: new Date('2026-11-14T08:00:00.000Z'), // outside the requested range
        costUsd: '0.300000',
      });

      const rows = await listAiUsage(tx, {
        userId: base.userId,
        from: new Date('2026-11-10T23:00:00.000Z'),
        to: new Date('2026-11-12T23:00:00.000Z'),
      });
      expect(rows).toHaveLength(3);
      expect(rows.map((row) => `${row.day}:${row.formationId ?? 'none'}`)).toEqual([
        `2026-11-11:${base.formationId}`,
        '2026-11-11:none',
        `2026-11-12:${base.formationId}`,
      ]);
      expect(rows[0]).toMatchObject({ calls: 1, spentUsd: '0.100000', inputTokens: 100 });
      expect(rows[1]).toMatchObject({ calls: 1, spentUsd: '0.050000' });
      expect(rows[2]).toMatchObject({ calls: 1, spentUsd: '0.200000' });
      for (const row of rows) {
        expect(JSON.stringify(row)).not.toContain('encrypted');
        expect(Object.keys(row)).not.toContain('encryptedKey');
      }

      const filtered = await listAiUsage(tx, {
        userId: base.userId,
        from: new Date('2026-11-10T23:00:00.000Z'),
        to: new Date('2026-11-12T23:00:00.000Z'),
        formationId: base.formationId,
      });
      expect(filtered).toHaveLength(2);
      expect(filtered.every((row) => row.formationId === base.formationId)).toBe(true);

      await expect(
        listAiUsage(tx, {
          userId: base.userId,
          from: new Date('2026-11-12T00:00:00.000Z'),
          to: new Date('2026-11-11T00:00:00.000Z'),
        }),
      ).rejects.toThrow(AppError);
    });
  });

  it('ET-3 / ET-4 — la vue ai_spend_today applique aussi la RLS du propriétaire', async () => {
    const base = await serviceDb().transaction(async (tx) => {
      const user = await baseUser(tx);
      await tx.execute(sql`
        insert into public.ai_calls (user_id, task, provider, model, managed, cost_usd, status, created_at)
        values (
          ${user.userId}::uuid, 'tutor', 'anthropic', 'claude-haiku-4-5-20251001', true, 0.420000, 'ok',
          (((now() at time zone 'Europe/Paris')::date + time '12:00') at time zone 'Europe/Paris')
        )
      `);
      return user;
    });
    try {
      const rows = await userDb({ userId: base.userId }).run((tx) =>
        tx.execute<Row>(sql`
          select user_id::text as user_id, spent_usd::text as spent_usd
          from public.ai_spend_today
        `),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        user_id: base.userId,
        spent_usd: '0.420000',
      });
    } finally {
      await serviceDb().execute(sql`delete from auth.users where id = ${base.userId}::uuid`);
    }
  });

  it('CL-8 — supprimer le compte emporte clés, choix, appels et abonnement', async () => {
    const seed = await serviceDb().transaction(async (tx) => {
      const base = await baseUser(tx);
      const id = await credentialId(tx, base.userId, 'qualified');
      await setTaskModel(tx, {
        userId: base.userId,
        task: 'gaps',
        credentialId: id,
        modelId: 'claude-haiku-4-5-20251001',
      });
      await upsertSubscription(tx, {
        userId: base.userId,
        status: 'active',
        currentPeriodEnd: NEXT_PERIOD,
      });
      await recordAiCall(tx, {
        userId: base.userId,
        task: 'gaps',
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        managed: false,
        costUsd: '0.000000',
        status: 'ok',
        createdAt: FIXED,
      });
      return base;
    });

    await serviceDb().execute(sql`delete from auth.users where id = ${seed.userId}::uuid`);
    for (const table of TABLES) {
      const [row] = await serviceDb().execute<Row>(sql`
        select count(*)::int as found from ${sql.raw(`public.${table}`)}
        where user_id = ${seed.userId}::uuid
      `);
      expect(row?.found, table).toBe(0);
    }
  });
});
