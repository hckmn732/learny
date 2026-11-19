import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, serviceDb } from '../../src/client';
import { seedPerf, type PerfSeedSummary } from '../../src/seed/perf';
import { PERF_USER_COUNT, perfUserEmail } from '../../src/seed/perf-credentials';

afterAll(async () => {
  await closeDb();
});

async function counts(): Promise<Record<string, number>> {
  const rows = await serviceDb().execute<Record<string, string>>(sql`
    select
      (select count(*) from public.profiles where email like 'perf-%@learny.test') as users,
      (select count(*) from public.formations) as formations,
      (select count(*) from public.notions) as notions,
      (select count(*) from public.notion_states) as states,
      (select count(*) from public.review_logs) as logs,
      (select count(*) from public.schedule_slots) as slots,
      (select count(*) from public.notifications) as notifications,
      (select count(*) from public.resources) as resources,
      (select count(*) from public.attempts) as attempts
  `);
  const row = rows[0] ?? {};
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
}

describe('[SPEC-804] données de charge', () => {
  it('crée les volumes attendus et rejoue le seed sans doublon', async () => {
    const first: PerfSeedSummary = await seedPerf();
    expect(first.users).toBe(PERF_USER_COUNT + 1);
    expect(first.notions).toBeGreaterThanOrEqual(48);
    expect(first.heavyUsers).toBe(1);
    expect(first.reviewLogs).toBeGreaterThanOrEqual(15_000);
    expect(first.attempts).toBeGreaterThanOrEqual(8_000);

    const afterFirst = await counts();
    const second = await seedPerf();
    const afterSecond = await counts();
    expect(afterSecond).toEqual(afterFirst);
    expect(second.users).toBe(first.users);
  });

  it('expose les identifiants locaux des utilisateurs de charge', async () => {
    const rows = await serviceDb().execute<{ email: string }>(sql`
      select email from public.profiles where email = ${perfUserEmail(1)}
    `);
    expect(rows).toHaveLength(1);
    const heavy = await serviceDb().execute<{ count: string }>(sql`
      select count(*)::text as count from public.profiles where email = 'perf-heavy@learny.test'
    `);
    expect(Number(heavy[0]?.count)).toBe(1);
  });

  it('crée des propriétaires, programmes et acceptations compatibles avec les API', async () => {
    const rows = await serviceDb().execute<{ invalid: string }>(sql`
      select (
        select count(*)
        from public.profiles
        where email like 'perf-%@learny.test'
          and id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )::text as invalid
      union all
      select count(*)::text
      from public.profiles profile
      left join public.formations formation on formation.owner_id = profile.id
      where profile.email ~ '^perf-[0-9]{2}@learny[.]test$'
        and (
          profile.current_formation_id is distinct from formation.id
          or coalesce(formation.monogram, '') = ''
        )
      union all
      select count(*)::text
      from public.modules module
      join public.formations formation on formation.id = module.formation_id
      join public.profiles profile on profile.id = formation.owner_id
      where profile.email ~ '^perf-[0-9]{2}@learny[.]test$'
        and (module.planned_start is null or module.planned_end is null)
      union all
      select count(*)::text
      from public.profiles profile
      where profile.email ~ '^perf-[0-9]{2}@learny[.]test$'
        and not exists (
          select 1
          from public.legal_acceptances acceptance
          where acceptance.user_id = profile.id
            and acceptance.document = 'cgu'::public.legal_document
        )
    `);
    expect(rows.map((row) => Number(row.invalid))).toEqual([0, 0, 0, 0]);
  });
});
