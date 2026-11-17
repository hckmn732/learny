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
});
