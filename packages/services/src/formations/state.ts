// Shared reads and writes of the formation-management services (SPEC-618 EF-1, ET-2, ET-3,
// ET-5; ADR-0016, ADR-0075). Every query runs on the learner's RLS client, so a formation of
// another owner is indistinguishable from a missing one.

import {
  FORMATION_ACCENTS,
  FormationManagementState,
  type FormationManagementState as FormationManagementStateDto,
  type SidebarFormation,
} from '@learny/contracts';
import { AppError } from '@learny/core';
import { formationMonogram, sql, type DbTx } from '@learny/db';

interface ProfileRow {
  current_formation_id: string | null;
  timezone: string;
  [key: string]: unknown;
}

export interface FormationRow {
  id: string;
  title: string;
  monogram: string;
  accent_color: string;
  status: 'active' | 'paused' | 'cadrage' | 'programme_proposed' | 'completed' | 'archived';
  last_opened_at: Date | string | null;
  paused_at: Date | string | null;
  updated_at: Date | string;
  created_at: Date | string;
  [key: string]: unknown;
}

interface FormationProgressRow {
  id: string;
  title: string;
  monogram: string;
  accent_color: string;
  status: 'active' | 'paused';
  last_opened_at: Date | string | null;
  created_at: Date | string;
  module_count: number;
  validated_count: number;
  open_position: number | null;
  [key: string]: unknown;
}

export function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function accentOf(value: string): SidebarFormation['accent'] {
  return (FORMATION_ACCENTS as readonly string[]).includes(value)
    ? (value as SidebarFormation['accent'])
    : 'indigo';
}

function toManagedFormation(row: FormationProgressRow): SidebarFormation {
  return {
    id: row.id,
    title: row.title,
    monogram: formationMonogram(row.title, row.monogram),
    accent: accentOf(row.accent_color),
    status: row.status,
    progressPercent:
      row.module_count === 0 ? 0 : Math.round((row.validated_count / row.module_count) * 100),
    currentModulePosition: row.open_position,
    moduleCount: row.module_count,
  };
}

/** ET-3 — serializes every transition of one learner (pause, resume, archive, current). */
export async function lockFormationTransitions(tx: DbTx, userId: string): Promise<void> {
  await tx.execute(sql`
    select pg_advisory_xact_lock(hashtextextended('formations:' || ${userId}, 0))
  `);
}

export async function readProfileForUpdate(tx: DbTx, userId: string): Promise<ProfileRow> {
  const rows = await tx.execute<ProfileRow>(sql`
    select current_formation_id::text as current_formation_id, timezone
    from public.profiles
    where id = ${userId}::uuid
  `);
  const profile = rows[0];
  if (profile === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');
  return profile;
}

/** ET-1, CL-1 — owner-scoped read; another owner gets the same `NOT_FOUND` as an unknown id. */
export async function readFormationForUpdate(
  tx: DbTx,
  userId: string,
  formationId: string,
): Promise<FormationRow> {
  const rows = await tx.execute<FormationRow>(sql`
    select f.id::text as id,
           f.title,
           f.monogram,
           f.accent_color::text as accent_color,
           f.status::text as status,
           f.last_opened_at,
           f.paused_at,
           f.updated_at,
           f.created_at
    from public.formations f
    where f.id = ${formationId}::uuid
      and f.owner_id = ${userId}::uuid
    for update
  `);
  const formation = rows[0];
  if (formation === undefined) throw new AppError('NOT_FOUND', 'Formation introuvable.');
  return formation;
}

/** CL-2 — an object version that changed since the dialog opened answers 409. */
export function assertUpdatedAt(formation: FormationRow, expectedUpdatedAt?: string): void {
  if (expectedUpdatedAt === undefined) return;
  if (toIso(formation.updated_at) !== new Date(expectedUpdatedAt).toISOString()) {
    throw new AppError('CONFLICT', 'Cette formation a changé entre-temps. Rechargez la liste.', {
      status: 409,
    });
  }
}

export interface ManagedRows {
  readonly profile: ProfileRow;
  readonly rows: readonly FormationProgressRow[];
}

export async function readManagedRows(tx: DbTx, userId: string): Promise<ManagedRows> {
  const profile = await readProfileForUpdate(tx, userId);
  const rows = await tx.execute<FormationProgressRow>(sql`
    select f.id::text as id,
           f.title,
           f.monogram,
           f.accent_color::text as accent_color,
           f.status::text as status,
           f.last_opened_at,
           f.created_at,
           (select count(*)::int from public.modules m where m.formation_id = f.id) as module_count,
           (
             select count(*)::int
             from public.module_progress mp
             join public.modules m on m.id = mp.module_id
             where mp.user_id = ${userId}::uuid
               and m.formation_id = f.id
               and mp.status = 'validated'
           ) as validated_count,
           (
             select min(m.position)::int
             from public.modules m
             where m.formation_id = f.id
               and m.status = 'open'
           ) as open_position
    from public.formations f
    where f.owner_id = ${userId}::uuid
      and f.status in ('active', 'paused')
  `);
  return { profile, rows };
}

function lastOpenedKey(row: FormationProgressRow): string {
  return toIso(row.last_opened_at ?? row.created_at);
}

/**
 * EF-1 — active formations first (current one at the top, then by descending last opening), then
 * paused formations in the same order. The state always carries the effective current id.
 */
export function buildManagementState(managed: ManagedRows): FormationManagementStateDto {
  const active = managed.rows.filter((row) => row.status === 'active');
  const sortedActive = [...active].sort((left, right) =>
    lastOpenedKey(left) < lastOpenedKey(right) ? 1 : -1,
  );
  const explicitCurrent = sortedActive.find(
    (row) => row.id === managed.profile.current_formation_id,
  );
  const current = explicitCurrent ?? sortedActive[0] ?? null;
  const paused = managed.rows
    .filter((row) => row.status === 'paused')
    .sort((left, right) => (lastOpenedKey(left) < lastOpenedKey(right) ? 1 : -1));
  const ordered = [
    ...(current === null ? [] : [current]),
    ...sortedActive.filter((row) => row.id !== current?.id),
    ...paused,
  ];
  return FormationManagementState.parse({
    currentFormationId: current?.id ?? null,
    activeCount: active.length,
    formations: ordered.map(toManagedFormation),
  });
}

export async function readManagementState(
  tx: DbTx,
  userId: string,
): Promise<FormationManagementStateDto> {
  return buildManagementState(await readManagedRows(tx, userId));
}

/**
 * CL-5 — after pausing or archiving the current formation, the current one becomes the last
 * active formation consulted; with none left the profile stores null.
 */
export async function fallbackCurrentFormation(
  tx: DbTx,
  userId: string,
  removedFormationId: string,
): Promise<void> {
  const rows = await tx.execute<{ id: string }>(sql`
    select f.id::text as id
    from public.formations f
    where f.owner_id = ${userId}::uuid
      and f.status = 'active'
      and f.id <> ${removedFormationId}::uuid
    order by coalesce(f.last_opened_at, f.created_at) desc, f.created_at desc, f.id desc
    limit 1
  `);
  await tx.execute(sql`
    update public.profiles
    set current_formation_id = ${rows[0]?.id ?? null}::uuid
    where id = ${userId}::uuid
      and current_formation_id = ${removedFormationId}::uuid
  `);
}

/** ADR-0016 — a pause freezes every future planned slot; started and past slots stay readable. */
export async function cancelFutureSlots(
  tx: DbTx,
  userId: string,
  formationId: string,
  now: Date,
): Promise<void> {
  await tx.execute(sql`
    update public.schedule_slots
    set status = 'cancelled',
        updated_at = ${now.toISOString()}::timestamptz
    where user_id = ${userId}::uuid
      and formation_id = ${formationId}::uuid
      and status = 'planned'
      and starts_at >= ${now.toISOString()}::timestamptz
  `);
}

/** ADR-0075 — an active formation of the owner becomes current; anything else is a 404/409. */
export async function selectCurrentInTx(
  tx: DbTx,
  userId: string,
  formationId: string,
): Promise<void> {
  const rows = await tx.execute<{ status: string }>(sql`
    select f.status::text as status
    from public.formations f
    where f.id = ${formationId}::uuid
      and f.owner_id = ${userId}::uuid
  `);
  const formation = rows[0];
  if (formation === undefined) throw new AppError('NOT_FOUND', 'Formation introuvable.');
  if (formation.status !== 'active') {
    throw new AppError(
      'CONFLICT',
      'Seule une formation active peut devenir la formation courante.',
      {
        status: 409,
      },
    );
  }
  await tx.execute(sql`
    update public.profiles
    set current_formation_id = ${formationId}::uuid
    where id = ${userId}::uuid
  `);
}
