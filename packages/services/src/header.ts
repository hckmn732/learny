// Fixed header service of the application shell (SPEC-305 EF-1, EF-4, ET-2, ET-4; BR-NAV-01,
// BR-ACC-09). Everything is read with the learner's own RLS client (`ctx.db`): another learner's
// profile, formations or notifications never reach the DTO. The full e-mail address stays on the
// server; only the abbreviated label of the fallback identity is returned (CL-1).
import type { HeaderDto } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql, type DbTx } from '@learny/db';

import type { ServiceContext } from './context';
import { requireUser, toResult } from './resources/result';

interface HeaderRow {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  active_count: number;
  unread_count: number;
  [key: string]: unknown;
}

/**
 * Abbreviated display of an address (CL-1): first local character, then the domain. The local
 * part is never returned whole, so the header cannot expose the full address.
 */
export function abbreviateEmail(email: string | null): string | null {
  const value = (email ?? '').trim();
  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1) return null;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const first = local.charAt(0);
  return first === '' ? null : `${first}***@${domain}`;
}

function toHeader(row: HeaderRow): HeaderDto {
  return {
    firstName: row.first_name === null || row.first_name.trim() === '' ? null : row.first_name,
    lastName: row.last_name === null || row.last_name.trim() === '' ? null : row.last_name,
    emailLabel: abbreviateEmail(row.email),
    activeFormationCount: Math.max(0, row.active_count),
    unreadNotificationCount: Math.max(0, row.unread_count),
  };
}

async function readHeader(tx: DbTx, userId: string): Promise<HeaderDto> {
  const rows = await tx.execute<HeaderRow>(sql`
    select p.first_name,
           p.last_name,
           p.email,
           (select count(distinct f.id)::int
              from public.formations f
              left join public.groups g on g.formation_id = f.id
              left join public.group_members gm
                on gm.group_id = g.id
               and gm.user_id = p.id
               and gm.member_status = 'active'
               and gm.left_at is null
             where f.status = 'active'
               and (f.owner_id = p.id or gm.user_id is not null)) as active_count,
           (select count(*)::int
              from public.notifications n
             where n.user_id = p.id
               and n.read_at is null) as unread_count
      from public.profiles p
     where p.id = ${userId}::uuid
  `);
  const header = rows[0];
  if (header === undefined) {
    throw new AppError('NOT_FOUND', 'Profil introuvable.');
  }
  return toHeader(header);
}

/** GET /api/v1/me/header — header data of the authenticated learner (ET-1, ET-4). */
export function getHeader(ctx: ServiceContext): Promise<Result<HeaderDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return db.run((tx) => readHeader(tx, userId));
  });
}
