import { randomBytes } from 'node:crypto';
import fs from 'node:fs';

import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, createPostgresDatabase, serviceDb, userDb } from '../../src/client';
import { asService, asUser, createTestUser, withRollback } from '../../src/testing';

interface Row {
  [key: string]: unknown;
}

async function rows(query: ReturnType<typeof sql>): Promise<Row[]> {
  return serviceDb().execute(query);
}

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-101] harnais et clients', () => {
  it('exposes the four extensions, two functions and four enums after db:reset (CA-1)', async () => {
    const extensions = await rows(sql`
      select extname as name from pg_extension
      where extname in ('pgcrypto', 'vector', 'unaccent', 'pg_trgm')
      order by extname
    `);
    expect(extensions.map((row) => row.name)).toEqual([
      'pg_trgm',
      'pgcrypto',
      'unaccent',
      'vector',
    ]);

    const functions = await rows(sql`
      select p.proname as name
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('set_updated_at', 'immutable_unaccent')
      order by p.proname
    `);
    expect(functions.map((row) => row.name)).toEqual(['immutable_unaccent', 'set_updated_at']);

    const enums = await rows(sql`
      select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as values
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
        and t.typname in ('course_language', 'actor', 'content_origin', 'job_status')
      group by t.typname
      order by t.typname
    `);
    expect(enums).toEqual([
      { name: 'actor', values: ['tutor', 'learner', 'import'] },
      { name: 'content_origin', values: ['resource', 'tutor'] },
      { name: 'course_language', values: ['fr', 'en', 'es', 'de'] },
      { name: 'job_status', values: ['queued', 'running', 'done', 'failed'] },
    ]);
  });

  it('runs userDb as authenticated with auth.uid() and serviceDb as postgres (CA-2)', async () => {
    await withRollback(async (tx) => {
      const userA = await createTestUser(tx);
      const userB = await createTestUser(tx);
      const identity = async (userId: string): Promise<Row> => {
        const result = await userDb({ userId }).run(async (inner) => {
          const res = await inner.execute(
            sql`select auth.uid()::text as uid, current_user as role`,
          );
          return res[0] as Row;
        });
        return result;
      };

      expect(await identity(userA.id)).toEqual({ uid: userA.id, role: 'authenticated' });
      expect(await identity(userB.id)).toEqual({ uid: userB.id, role: 'authenticated' });

      const service = await tx.execute(sql`select auth.uid()::text as uid, current_user as role`);
      expect(service[0]).toEqual({ uid: null, role: 'postgres' });
    });
  });

  it('does not leak claims between successive or concurrent transactions (CL-2, CL-8)', async () => {
    const users = Array.from(
      { length: 2 },
      (_, index) => `33333333-3333-4333-8333-33333333333${String(index)}`,
    );
    const currentUser = async (userId: string): Promise<string> =>
      userDb({ userId }).run(async (tx) => {
        const result = await tx.execute(sql`select auth.uid()::text as uid`);
        return (result[0] as { uid: string }).uid;
      });

    for (const userId of [...users, ...users]) {
      expect(await currentUser(userId)).toBe(userId);
    }

    const results = await Promise.all(
      Array.from({ length: 20 }, async (_, index) => {
        const userId = users[index % users.length] ?? users[0] ?? '';
        return { expected: userId, actual: await currentUser(userId) };
      }),
    );
    for (const result of results) expect(result.actual).toBe(result.expected);
  });

  it('rolls back every withRollback write and supports createTestUser/asUser (CA-3)', async () => {
    const email = `rollback-${randomBytes(4).toString('hex')}@test.learny.test`;
    let createdId = '';
    await withRollback(async (tx) => {
      const user = await createTestUser(tx, { email, firstName: 'Alex', timezone: 'Europe/Paris' });
      createdId = user.id;
      const inside = await tx.execute(
        sql`select count(*)::int as count from auth.users where id = ${user.id}::uuid`,
      );
      expect(inside[0]).toEqual({ count: 1 });
    });
    const after = await rows(
      sql`select count(*)::int as count from auth.users where email = ${email}`,
    );
    expect(after[0]).toEqual({ count: 0 });
    expect(createdId).toMatch(/^[0-9a-f-]{36}$/);

    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const seen = await asUser(tx, user.id, async (inner) => {
        const result = await inner.execute(
          sql`select auth.uid()::text as uid, current_user as role`,
        );
        return result[0];
      });
      expect(seen).toEqual({ uid: user.id, role: 'authenticated' });

      const restored = await asService(tx, async (inner) => {
        const result = await inner.execute(sql`select current_user as role`);
        return result[0];
      });
      expect(restored).toEqual({ role: 'postgres' });
    });
  });

  it('refuses a nested withRollback (CL-3)', async () => {
    await withRollback(async () => {
      await expect(withRollback(() => Promise.resolve(1))).rejects.toThrow(
        'withRollback ne peut pas être imbriqué',
      );
    });
  });

  it('computes immutable_unaccent and uses it in an expression index (CA-5)', async () => {
    const value = await rows(
      sql`select public.immutable_unaccent('Équilibre d’une pièce') as value`,
    );
    expect(value[0]).toEqual({ value: "Equilibre d'une piece" });

    await withRollback(async (tx) => {
      await tx.execute(sql`create temporary table spec_101_unaccent (label text) on commit drop`);
      await tx.execute(
        sql`create index spec_101_unaccent_idx on spec_101_unaccent (public.immutable_unaccent(label))`,
      );
    });
  });

  it('reports a stopped local database with the pnpm dev:up hint (CL-5)', async () => {
    const handle = createPostgresDatabase({
      url: 'postgresql://postgres:postgres@127.0.0.1:1/postgres',
      max: 1,
    });
    try {
      await expect(handle.db.execute(sql`select 1`)).rejects.toThrow('pnpm dev:up');
    } finally {
      await handle.close();
    }
  });

  it('opens a userDb transaction and runs a trivial query under 15 ms p95 (CA-7)', async () => {
    const userId = '44444444-4444-4444-8444-444444444444';
    const durations: number[] = [];
    for (let index = 0; index < 50; index += 1) {
      const start = performance.now();
      await userDb({ userId }).run(async (tx) => {
        await tx.execute(sql`select 1`);
      });
      durations.push(performance.now() - start);
    }
    const sorted = [...durations].sort((a, b) => a - b);
    const percentile = (ratio: number): number => {
      const position = Math.min(sorted.length - 1, Math.ceil(ratio * sorted.length) - 1);
      return sorted[Math.max(0, position)] ?? 0;
    };
    const measurement = {
      iterations: durations.length,
      unit: 'ms',
      p50: Number(percentile(0.5).toFixed(3)),
      p95: Number(percentile(0.95).toFixed(3)),
      max: Number((sorted[sorted.length - 1] ?? 0).toFixed(3)),
      thresholdP95: 15,
    };
    const file = new URL('../../../../evidence/SPEC-101/latency.json', import.meta.url);
    fs.mkdirSync(new URL('.', file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(measurement, null, 2)}\n`);

    expect(measurement.p95, JSON.stringify(measurement)).toBeLessThan(15);
  });
});
