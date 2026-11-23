// Données de charge `pnpm perf:seed` (SPEC-804 ET-3). Volumes déterministes, idempotents : les
// comptes `perf-*@learny.test` sont supprimés puis recréés, ce qui réinitialise leurs données en
// cascade. Aucune donnée de démonstration n'est touchée.
import { sql } from 'drizzle-orm';

import { activeLegalVersions } from '@learny/config';

import { serviceDb, type DbTx } from '../client';

import { HEAVY_USER_EMAIL, PERF_LOCAL_SECRET } from './perf-credentials';

export interface PerfSeedSummary {
  users: number;
  heavyUsers: number;
  formations: number;
  notions: number;
  notionStates: number;
  reviewLogs: number;
  scheduleSlots: number;
  notifications: number;
  resources: number;
  attempts: number;
}

const PERF_USER = sql`pg_temp.perf_uuid('perf:user:' || i::text)`;
const HEAVY_ID = sql`pg_temp.perf_uuid('perf:user:heavy')`;

async function installUuidGenerator(tx: DbTx): Promise<void> {
  await tx.execute(sql`
    create or replace function pg_temp.perf_uuid(source text)
    returns uuid
    language sql
    immutable
    parallel safe
    as $function$
      select (
        substr(md5(source), 1, 12) ||
        '4' ||
        substr(md5(source), 14, 3) ||
        '8' ||
        substr(md5(source), 18, 15)
      )::uuid
    $function$
  `);
}

async function setEncryptionKey(tx: DbTx): Promise<void> {
  await tx.execute(sql`select set_config('app.encryption_key', ${PERF_LOCAL_SECRET}, true)`);
}

async function insertUsers(tx: DbTx): Promise<void> {
  const versions = activeLegalVersions();
  await tx.execute(sql`
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, reauthentication_token, raw_user_meta_data,
      raw_app_meta_data, created_at, updated_at
    )
    select
      ${PERF_USER},
      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'perf-' || lpad(i::text, 2, '0') || '@learny.test',
      crypt(${PERF_LOCAL_SECRET}, gen_salt('bf')),
      '2026-10-01T09:00:00Z', '', '', '', '', '', '',
      '{"timezone":"Europe/Paris"}'::jsonb,
      '{"provider":"email","providers":["email"]}'::jsonb,
      '2026-10-01T09:00:00Z', '2026-10-01T09:00:00Z'
    from generate_series(1, 50) as i
  `);
  await tx.execute(sql`
    update public.profiles
    set onboarding_step = 'done', first_name = 'Perf', last_name = 'Load'
    where email like 'perf-%@learny.test'
  `);
  await tx.execute(sql`
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, reauthentication_token, raw_user_meta_data,
      raw_app_meta_data, created_at, updated_at
    )
    values (
      ${HEAVY_ID}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      ${HEAVY_USER_EMAIL}, crypt(${PERF_LOCAL_SECRET}, gen_salt('bf')), '2026-10-01T09:00:00Z',
      '', '', '', '', '', '', '{"timezone":"Europe/Paris"}'::jsonb,
      '{"provider":"email","providers":["email"]}'::jsonb,
      '2026-10-01T09:00:00Z', '2026-10-01T09:00:00Z'
    )
  `);
  await tx.execute(sql`
    update public.profiles
    set onboarding_step = 'done', first_name = 'Perf', last_name = 'Heavy'
    where id = ${HEAVY_ID}
  `);
  await tx.execute(sql`
    insert into public.legal_acceptances (user_id, document, version)
    select id, 'cgu'::public.legal_document, ${versions.cgu}
    from public.profiles
    where email like 'perf-%@learny.test'
    union all
    select id, 'privacy'::public.legal_document, ${versions.privacy}
    from public.profiles
    where email like 'perf-%@learny.test'
    on conflict (user_id, document, version) do nothing
  `);
}

async function insertLearning(tx: DbTx): Promise<void> {
  await tx.execute(sql`
    insert into public.formations (id, owner_id, title, description, objectives, status, volume_hours, start_date, end_date, monogram)
    select pg_temp.perf_uuid('perf:formation:' || i::text), ${PERF_USER}, 'Formation de charge ' || i::text,
           'Jeu de charge local', '{operational,exam}'::formation_objective[],
           'active', 40, '2026-11-02', '2026-12-11', 'C' || lpad(i::text, 2, '0')
    from generate_series(1, 50) as i
  `);
  await tx.execute(sql`
    update public.profiles as profile
    set current_formation_id = formation.id
    from public.formations as formation
    where profile.email like 'perf-%@learny.test'
      and formation.owner_id = profile.id
  `);
  await tx.execute(sql`
    insert into public.modules (
      id, formation_id, position, title, status, threshold, planned_start, planned_end
    )
    select pg_temp.perf_uuid('perf:module:' || i::text || ':' || m::text),
           pg_temp.perf_uuid('perf:formation:' || i::text), m, 'Module ' || m::text, 'open', 80,
           '2026-11-02'::date + ((m - 1) * 7),
           '2026-11-02'::date + (m * 7 - 1)
    from generate_series(1, 50) as i, generate_series(1, 7) as m
  `);
  await tx.execute(sql`
    insert into public.chapters (id, module_id, formation_id, position, title)
    select pg_temp.perf_uuid('perf:chapter:' || i::text || ':' || m::text || ':1'),
           pg_temp.perf_uuid('perf:module:' || i::text || ':' || m::text),
           pg_temp.perf_uuid('perf:formation:' || i::text), 1, 'Chapitre ' || m::text
    from generate_series(1, 50) as i, generate_series(1, 7) as m
  `);
  await tx.execute(sql`
    insert into public.notions (id, formation_id, module_id, chapter_id, label, position, created_by)
    select pg_temp.perf_uuid('perf:notion:' || i::text || ':' || n::text),
           pg_temp.perf_uuid('perf:formation:' || i::text),
           pg_temp.perf_uuid('perf:module:' || i::text || ':' || (((n - 1) % 7) + 1)::text),
           pg_temp.perf_uuid('perf:chapter:' || i::text || ':' || (((n - 1) % 7) + 1)::text || ':1'),
           'Notion ' || n::text, (((n - 1) / 7) + 1)::int, 'tutor'
    from generate_series(1, 50) as i, generate_series(1, 120) as n
  `);
  await tx.execute(sql`
    insert into public.notion_states (
      user_id, notion_id, fsrs, due_at, mastery, first_seen_at, last_seen_at,
      success_count, in_review
    )
    select ${PERF_USER}, pg_temp.perf_uuid('perf:notion:' || i::text || ':' || n::text),
           '{"due":"2026-11-11T12:00:00.000Z","stability":2.5,"difficulty":5,"elapsed_days":1,"scheduled_days":3,"reps":2,"lapses":0,"state":2,"last_review":"2026-11-10T09:00:00.000Z"}'::jsonb,
           case when n <= 14 then '2026-11-11T12:00:00Z'::timestamptz
                else '2026-11-20T12:00:00Z'::timestamptz end,
           50, '2026-11-01T09:00:00Z', '2026-11-10T09:00:00Z', 2, true
    from generate_series(1, 50) as i, generate_series(1, 120) as n
  `);
  await tx.execute(sql`
    insert into public.review_logs (user_id, notion_id, source, grade, correct, time_ms, reviewed_at)
    select ${PERF_USER}, pg_temp.perf_uuid('perf:notion:' || i::text || ':' || (((r - 1) % 120) + 1)::text),
           'global_quiz', 'good', true, 4200,
           '2026-11-01T08:00:00Z'::timestamptz + (r || ' hours')::interval
    from generate_series(1, 50) as i, generate_series(1, 300) as r
  `);
  await tx.execute(sql`
    insert into public.schedule_slots (
      id, user_id, formation_id, module_id, kind, title, starts_at, ends_at, status, created_by, planner_key
    )
    select pg_temp.perf_uuid('perf:slot:' || i::text || ':' || r::text), ${PERF_USER},
           pg_temp.perf_uuid('perf:formation:' || i::text),
           pg_temp.perf_uuid('perf:module:' || i::text || ':' || (((r - 1) % 7) + 1)::text),
           'revision', 'Révision de charge', '2026-11-01T08:00:00Z'::timestamptz + (r || ' hours')::interval,
           '2026-11-01T09:00:00Z'::timestamptz + (r || ' hours')::interval,
           'planned', 'planner', i::text || ':' || r::text
    from generate_series(1, 50) as i, generate_series(1, 60) as r
  `);
  await tx.execute(sql`
    insert into public.notifications (
      id, user_id, formation_id, type, title, body, href, icon, dedupe_key, read_at, created_at
    )
    select pg_temp.perf_uuid('perf:notification:' || i::text || ':' || r::text), ${PERF_USER},
           pg_temp.perf_uuid('perf:formation:' || i::text), 'daily_digest',
           'Résumé du jour ' || r::text, 'Vos révisions de charge sont prêtes.',
           '/accueil', 'bell', i::text || ':' || r::text,
           case when r % 3 = 0 then '2026-11-10T09:00:00Z'::timestamptz else null end,
           '2026-11-01T08:00:00Z'::timestamptz + (r || ' hours')::interval
    from generate_series(1, 50) as i, generate_series(1, 40) as r
  `);
}

async function insertHeavy(tx: DbTx): Promise<void> {
  await tx.execute(sql`
    insert into public.formations (id, owner_id, title, description, objectives, status, volume_hours, start_date, end_date, monogram)
    select pg_temp.perf_uuid('perf:heavy:formation:' || f::text), ${HEAVY_ID},
           'Formation volumineuse ' || f::text, 'Jeu de charge local',
           '{operational,exam}'::formation_objective[], 'active', 120, '2026-09-01', '2026-12-20',
           'PV' || f::text
    from generate_series(1, 3) as f
  `);
  await tx.execute(sql`
    insert into public.modules (
      id, formation_id, position, title, status, threshold, planned_start, planned_end
    )
    select pg_temp.perf_uuid('perf:heavy:module:' || f::text || ':' || m::text),
           pg_temp.perf_uuid('perf:heavy:formation:' || f::text), m, 'Module lourd ' || m::text, 'open', 80,
           '2026-09-01'::date + ((m - 1) * 14),
           '2026-09-01'::date + (m * 14 - 1)
    from generate_series(1, 3) as f, generate_series(1, 7) as m
  `);
  await tx.execute(sql`
    insert into public.chapters (id, module_id, formation_id, position, title)
    select pg_temp.perf_uuid('perf:heavy:chapter:' || f::text || ':' || m::text || ':1'),
           pg_temp.perf_uuid('perf:heavy:module:' || f::text || ':' || m::text),
           pg_temp.perf_uuid('perf:heavy:formation:' || f::text), 1, 'Chapitre lourd ' || m::text
    from generate_series(1, 3) as f, generate_series(1, 7) as m
  `);
  await tx.execute(sql`
    insert into public.notions (id, formation_id, module_id, chapter_id, label, position, created_by)
    select pg_temp.perf_uuid('perf:heavy:notion:' || n::text),
           pg_temp.perf_uuid('perf:heavy:formation:' || ((((n - 1) % 3) + 1))::text),
           pg_temp.perf_uuid('perf:heavy:module:' || ((((n - 1) % 3) + 1))::text || ':' || ((((n - 1) % 7) + 1))::text),
           pg_temp.perf_uuid('perf:heavy:chapter:' || ((((n - 1) % 3) + 1))::text || ':' || ((((n - 1) % 7) + 1))::text || ':1'),
           'Notion volumineuse ' || n::text, (((n - 1) / 7) + 1)::int, 'tutor'
    from generate_series(1, 900) as n
  `);
  await tx.execute(sql`
    insert into public.notion_states (
      user_id, notion_id, fsrs, due_at, mastery, first_seen_at, last_seen_at,
      success_count, in_review, gap_nature, gap_detected_at
    )
    select ${HEAVY_ID}, pg_temp.perf_uuid('perf:heavy:notion:' || n::text), '{"due":"2026-11-11T12:00:00.000Z","stability":2.5,"difficulty":5,"elapsed_days":1,"scheduled_days":3,"reps":2,"lapses":0,"state":2,"last_review":"2026-11-10T09:00:00.000Z"}'::jsonb,
           case when n <= 14 then '2026-11-11T12:00:00Z'::timestamptz
                else '2026-11-20T12:00:00Z'::timestamptz end,
           45, '2026-09-01T09:00:00Z', '2026-11-10T09:00:00Z', 3, true,
           case when n % 90 = 0 then 'confusion'::gap_nature else null end,
           case when n % 90 = 0 then '2026-11-05T09:00:00Z'::timestamptz else null end
    from generate_series(1, 900) as n
  `);
  await tx.execute(sql`
    insert into public.review_logs (user_id, notion_id, source, grade, correct, time_ms, reviewed_at)
    select ${HEAVY_ID}, pg_temp.perf_uuid('perf:heavy:notion:' || (((r - 1) % 900) + 1)::text),
           'global_quiz', 'good', true, 3800,
           '2026-09-01T08:00:00Z'::timestamptz + (r || ' hours')::interval
    from generate_series(1, 15000) as r
  `);
  await tx.execute(sql`
    insert into public.schedule_slots (
      id, user_id, formation_id, module_id, kind, title, starts_at, ends_at, status, created_by, planner_key
    )
    select pg_temp.perf_uuid('perf:heavy:slot:' || r::text), ${HEAVY_ID},
           pg_temp.perf_uuid('perf:heavy:formation:' || ((((r - 1) % 3) + 1))::text),
           pg_temp.perf_uuid('perf:heavy:module:' || ((((r - 1) % 3) + 1))::text || ':' || ((((r - 1) % 7) + 1))::text),
           'revision', 'Révision volumineuse',
           '2026-09-01T08:00:00Z'::timestamptz + (r || ' hours')::interval,
           '2026-09-01T09:00:00Z'::timestamptz + (r || ' hours')::interval,
           'planned', 'planner', 'heavy:' || r::text
    from generate_series(1, 2000) as r
  `);
  await tx.execute(sql`
    insert into public.notifications (
      id, user_id, formation_id, type, title, body, href, icon, dedupe_key, read_at, created_at
    )
    select pg_temp.perf_uuid('perf:heavy:notification:' || r::text), ${HEAVY_ID},
           pg_temp.perf_uuid('perf:heavy:formation:' || ((((r - 1) % 3) + 1))::text), 'daily_digest',
           'Notification volumineuse ' || r::text, 'Contenu de charge.',
           '/accueil', 'bell', 'heavy:' || r::text,
           case when r % 2 = 0 then '2026-11-10T09:00:00Z'::timestamptz else null end,
           '2026-09-01T08:00:00Z'::timestamptz + (r || ' hours')::interval
    from generate_series(1, 1000) as r
  `);
  await tx.execute(sql`
    insert into public.resources (id, owner_id, formation_id, kind, title, content_text, status, metadata)
    select pg_temp.perf_uuid('perf:heavy:resource:' || r::text), ${HEAVY_ID},
           pg_temp.perf_uuid('perf:heavy:formation:' || ((((r - 1) % 3) + 1))::text),
           'note', 'Ressource volumineuse ' || r::text, 'Contenu de charge de la ressource ' || r::text,
           'ready', '{}'::jsonb
    from generate_series(1, 400) as r
  `);
  await tx.execute(sql`
    insert into public.resource_chunks (
      id, resource_id, owner_id, formation_id, position, text, location, token_count
    )
    select pg_temp.perf_uuid('perf:heavy:chunk:' || r::text),
           pg_temp.perf_uuid('perf:heavy:resource:' || r::text), ${HEAVY_ID},
           pg_temp.perf_uuid('perf:heavy:formation:' || ((((r - 1) % 3) + 1))::text),
           0, 'Extrait de charge ' || r::text,
           '{"charStart":0,"charEnd":24}'::jsonb, 10
    from generate_series(1, 400) as r
  `);
  await tx.execute(sql`
    insert into public.activities (id, owner_id, formation_id, kind, status, for_date, items)
    select pg_temp.perf_uuid('perf:heavy:activity:' || f::text), ${HEAVY_ID},
           pg_temp.perf_uuid('perf:heavy:formation:' || f::text), 'validation_quiz', 'draft',
           '2026-11-11', '[]'::jsonb
    from generate_series(1, 3) as f
  `);
  await tx.execute(sql`
    insert into public.attempts (
      id, user_id, activity_id, attempt_no, status, started_at, submitted_at, score, passed, per_notion
    )
    select pg_temp.perf_uuid('perf:heavy:attempt:' || r::text), ${HEAVY_ID},
           pg_temp.perf_uuid('perf:heavy:activity:' || ((((r - 1) % 3) + 1))::text),
           r, 'graded', '2026-09-01T08:00:00Z'::timestamptz,
           '2026-09-01T08:05:00Z'::timestamptz, 80, true, '{}'::jsonb
    from generate_series(1, 8000) as r
  `);
}

async function count(tx: DbTx, query: ReturnType<typeof sql>): Promise<number> {
  const rows = await tx.execute<{ count: string }>(query);
  return Number(rows[0]?.count ?? 0);
}

export async function seedPerf(): Promise<PerfSeedSummary> {
  return serviceDb().transaction(async (tx) => {
    await setEncryptionKey(tx);
    await installUuidGenerator(tx);
    await tx.execute(sql`delete from auth.users where email like 'perf-%@learny.test'`);
    await insertUsers(tx);
    await insertLearning(tx);
    await insertHeavy(tx);
    const [
      users,
      formations,
      notions,
      notionStates,
      reviewLogs,
      scheduleSlots,
      notifications,
      resources,
      attempts,
    ] = await Promise.all([
      count(
        tx,
        sql`select count(*)::text from public.profiles where email like 'perf-%@learny.test'`,
      ),
      count(tx, sql`select count(*)::text from public.formations`),
      count(tx, sql`select count(*)::text from public.notions`),
      count(tx, sql`select count(*)::text from public.notion_states`),
      count(tx, sql`select count(*)::text from public.review_logs`),
      count(tx, sql`select count(*)::text from public.schedule_slots`),
      count(tx, sql`select count(*)::text from public.notifications`),
      count(tx, sql`select count(*)::text from public.resources`),
      count(tx, sql`select count(*)::text from public.attempts`),
    ]);
    return {
      users,
      heavyUsers: 1,
      formations,
      notions,
      notionStates,
      reviewLogs,
      scheduleSlots,
      notifications,
      resources,
      attempts,
    };
  });
}
