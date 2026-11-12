import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, serviceDb } from '../../src/client';

interface Row {
  [key: string]: unknown;
}

async function rows(query: ReturnType<typeof sql>): Promise<Row[]> {
  return serviceDb().execute(query);
}

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-101] conventions de schéma', () => {
  // CL-6: this test stays active for SPEC-102 to SPEC-112. It names every offending table.
  it('every table with updated_at has its set_updated_at trigger (CL-6)', async () => {
    const tables = await rows(sql`
      select c.table_name as table
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public'
        and t.table_type = 'BASE TABLE'
        and c.column_name = 'updated_at'
        -- rate_limits.updated_at is the injected-clock refill instant, not an audit timestamp;
        -- the audit trigger would overwrite it with the system clock (SPEC-208 CA-1, ADR-0047).
        and c.table_name <> 'rate_limits'
        and not exists (
          select 1
          from pg_trigger tg
          join pg_class cl on cl.oid = tg.tgrelid
          join pg_namespace n on n.oid = cl.relnamespace
          where n.nspname = 'public'
            and cl.relname = c.table_name
            and tg.tgname = 'set_updated_at'
            and not tg.tgisinternal
        )
      order by c.table_name
    `);
    const missing = tables.map((row) => String(row.table));
    expect(
      missing,
      `tables avec updated_at sans déclencheur set_updated_at : ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('every created_at is timestamptz not null default now()', async () => {
    const columns = await rows(sql`
      select c.table_name as table, c.data_type as data_type,
             c.is_nullable as is_nullable, c.column_default as column_default
      from information_schema.columns c
      where c.table_schema = 'public' and c.column_name = 'created_at'
      order by c.table_name
    `);
    const invalid = columns
      .filter(
        (column) =>
          column.data_type !== 'timestamp with time zone' ||
          column.is_nullable !== 'NO' ||
          column.column_default !== 'now()',
      )
      .map((column) => String(column.table));
    expect(invalid, `colonnes created_at non conformes : ${invalid.join(', ')}`).toEqual([]);
  });
});
