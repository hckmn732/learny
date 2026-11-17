import { sql, type SQL } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, serviceDb } from '../../src/client';
import { seedPerf } from '../../src/seed/perf';

afterAll(async () => {
  await closeDb();
});

const HEAVY_ID = sql`md5('perf:user:heavy')::uuid`;
const ZERO_VECTOR = sql`(select ('[' || array_to_string(array_fill(0.0::real, ARRAY[1024]), ',') || ']')::vector)`;

interface ExplainEntry {
  Plan: PlanNode & { 'Actual Rows'?: number };
  'Execution Time': number;
}
interface PlanRow {
  [key: string]: unknown;
}

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  Plans?: PlanNode[];
}

function seqScanRelations(node: PlanNode, found: string[] = []): string[] {
  if (node['Node Type'] === 'Seq Scan' && node['Relation Name'] !== undefined) {
    found.push(node['Relation Name']);
  }
  for (const child of node.Plans ?? []) seqScanRelations(child, found);
  return found;
}

async function explain(
  query: SQL,
): Promise<{ actualRows: number; durationMs: number; seqScans: string[] }> {
  const rows = await serviceDb().execute<PlanRow>(
    sql`explain (analyze, buffers, format json) ${query}`,
  );
  const entries = rows[0]?.['QUERY PLAN'] as ExplainEntry[] | undefined;
  const plan = entries?.[0];
  if (plan === undefined) throw new Error('plan EXPLAIN absent');
  return {
    actualRows: plan.Plan['Actual Rows'] ?? 0,
    durationMs: plan['Execution Time'],
    seqScans: seqScanRelations(plan.Plan),
  };
}

const QUERIES: { name: string; query: SQL }[] = [
  {
    name: 'notions dues',
    query: sql`select notion_id from public.notion_states
      where user_id = ${HEAVY_ID} and in_review and due_at <= '2026-11-11T23:59:59Z'
      order by due_at limit 40`,
  },
  {
    name: 'créneaux d’une période',
    query: sql`select id from public.schedule_slots
      where user_id = ${HEAVY_ID} and starts_at >= '2026-11-09' and starts_at < '2026-11-16'
      order by starts_at`,
  },
  {
    name: 'liste des notifications',
    query: sql`select id from public.notifications
      where user_id = ${HEAVY_ID} order by created_at desc limit 30`,
  },
  {
    name: 'compteur non lues',
    query: sql`select count(*) from public.notifications where user_id = ${HEAVY_ID} and read_at is null`,
  },
  {
    name: 'historique d’une notion',
    query: sql`select id from public.review_logs
      where user_id = ${HEAVY_ID} and notion_id = md5('perf:heavy:notion:1')::uuid
      order by reviewed_at desc limit 20`,
  },
  {
    name: 'lacunes d’une formation',
    query: sql`select notion_id from public.notion_states
      where user_id = ${HEAVY_ID} and gap_nature is not null and gap_cleared_at is null`,
  },
  {
    name: 'sessions du jour',
    query: sql`select id from public.activities
      where owner_id = ${HEAVY_ID} and formation_id = md5('perf:heavy:formation:1')::uuid
        and kind = 'validation_quiz' and for_date = '2026-11-11'`,
  },
  {
    name: 'banque d’une notion',
    query: sql`select id from public.bricks
      where owner_id = ${HEAVY_ID} and formation_id = md5('perf:heavy:formation:1')::uuid
        and purpose = 'validation' and status = 'active'`,
  },
  {
    name: 'sections d’un cours',
    query: sql`select id from public.course_sections
      where course_id = md5('perf:heavy:course:1')::uuid order by position`,
  },
  {
    name: 'citations d’une section',
    query: sql`select id from public.citations where section_id = md5('perf:heavy:section:1')::uuid`,
  },
  {
    name: 'journal des automatismes',
    query: sql`select id from public.automation_actions
      where user_id = ${HEAVY_ID} order by created_at desc limit 20`,
  },
  {
    name: 'dépense du jour',
    query: sql`select id from public.ai_calls
      where user_id = ${HEAVY_ID} and created_at >= '2026-11-11' and created_at < '2026-11-12'`,
  },
  {
    name: 'recherche sémantique',
    query: sql`select id from public.resource_chunks
      where owner_id = ${HEAVY_ID} order by embedding <=> ${ZERO_VECTOR} limit 10`,
  },
];

async function bigTables(): Promise<Set<string>> {
  const rows = await serviceDb().execute<{ relname: string }>(sql`
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.reltuples > 5000
  `);
  return new Set(rows.map((row) => row.relname));
}

describe('[SPEC-804] plans de requêtes', () => {
  beforeAll(async () => {
    await seedPerf();
    await serviceDb().execute(sql`analyze`);
  }, 180_000);

  it('aucune lecture séquentielle sur une table de plus de 5 000 lignes', async () => {
    const big = await bigTables();
    expect(big.has('review_logs')).toBe(true);
    const failures: string[] = [];
    for (const { name, query } of QUERIES) {
      const result = await explain(query);
      const offending = result.seqScans.filter((relation) => big.has(relation));
      if (offending.length > 0) failures.push(`${name}: Seq Scan sur ${offending.join(', ')}`);
      expect(result.durationMs, `${name} < 50 ms`).toBeLessThan(50);
    }
    expect(failures).toEqual([]);
  }, 120_000);
});
