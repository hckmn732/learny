// Daily offline pack (SPEC-801 ET-5, EF-4; ADR-0200). The pack reuses the session service so the
// offline screen shows exactly the items of the online screen, then attaches the full payload of
// every brick version (correct answers included) so the browser can grade locally. It also adds
// up to twenty recall cards of notions due tomorrow. No AI call is made: a notion without an
// existing recall card is simply omitted (BR-IA-09).
import { sql } from 'drizzle-orm';

import {
  OfflinePackResponseSchema,
  type GlobalQuizSessionDto,
  type OfflineExtraCard,
  type OfflinePack,
  type OfflinePackResponse,
} from '@learny/contracts';
import { addCivilDays, endOfUserDay, userDayBounds, userLocalDay, type Result } from '@learny/core';
import { type DbTx } from '@learny/db';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';
import { getOrCreateTodaySession } from '../review/global-quiz';

const MAX_EXTRA_CARDS = 20;
const MAX_FORMATIONS = 3;

export const OFFLINE_PACK_FALLBACK_TIME_ZONE = 'Europe/Paris';

/** Origins the pack may contain (EF-4): the learner's active formations, three at most. */
export async function listActiveFormations(
  tx: DbTx,
  userId: string,
): Promise<{ id: string; title: string }[]> {
  return tx.execute<{ id: string; title: string }>(sql`
    select f.id::text as id, f.title
    from public.formations f
    where f.status = 'active'
      and (
        f.owner_id = ${userId}::uuid
        or exists (
          select 1
          from public.groups g
          join public.group_members gm on gm.group_id = g.id
          where g.formation_id = f.id
            and gm.user_id = ${userId}::uuid
            and gm.member_status = 'active'
            and gm.left_at is null
        )
      )
    order by f.created_at asc
    limit ${MAX_FORMATIONS}
  `);
}

async function profileTimeZone(tx: DbTx, userId: string): Promise<string> {
  const rows = await tx.execute<{ timezone: string }>(sql`
    select timezone from public.profiles where id = ${userId}::uuid
  `);
  return rows[0]?.timezone ?? OFFLINE_PACK_FALLBACK_TIME_ZONE;
}

/** Full payloads of the session items, read under the learner's RLS client (ET-5). */
async function fullPayloads(
  tx: DbTx,
  versionIds: readonly string[],
): Promise<Map<string, unknown>> {
  if (versionIds.length === 0) return new Map();
  const rows = await tx.execute<{ id: string; payload: unknown }>(sql`
    select id::text as id, payload
    from public.brick_versions
    where id = any(
      array(select jsonb_array_elements_text(${JSON.stringify([...new Set(versionIds)])}::jsonb)::uuid)
    )
  `);
  return new Map(rows.map((row) => [row.id, row.payload]));
}

/** Up to twenty extra recall cards of notions due tomorrow (EF-4), full payload included. */
async function extraCardsOf(
  tx: DbTx,
  userId: string,
  formationId: string,
  timeZone: string,
  today: string,
  exclude: ReadonlySet<string>,
): Promise<OfflineExtraCard[]> {
  const tomorrow = addCivilDays(today, 1);
  const start = userDayBounds(tomorrow, timeZone).start;
  const end = endOfUserDay(tomorrow, timeZone);
  const rows = await tx.execute<{
    notion_id: string;
    label: string;
    version_id: string;
    payload: unknown;
  }>(sql`
    select distinct on (ns.notion_id)
      ns.notion_id::text as notion_id,
      n.label,
      bv.id::text as version_id,
      bv.payload
    from public.notion_states ns
    join public.notions n on n.id = ns.notion_id
    join public.bricks b on b.formation_id = n.formation_id
      and ns.notion_id = any(b.notion_ids)
      and b.type = 'recall_card'
      and b.status = 'active'
      and b.owner_id = ${userId}::uuid
    join public.brick_versions bv on bv.brick_id = b.id and bv.version = b.current_version
    where ns.user_id = ${userId}::uuid
      and n.formation_id = ${formationId}::uuid
      and not ns.suspended
      and ns.due_at >= ${start.toISOString()}::timestamptz
      and ns.due_at <= ${end.toISOString()}::timestamptz
    order by ns.notion_id, b.created_at desc
  `);
  const cards: OfflineExtraCard[] = [];
  for (const row of rows) {
    if (exclude.has(row.notion_id)) continue;
    cards.push({
      brickVersionId: row.version_id,
      notionId: row.notion_id,
      notionLabel: row.label,
      payload: row.payload,
    });
    if (cards.length >= MAX_EXTRA_CARDS) break;
  }
  return cards;
}

/** Replaces the public session payloads by the full version payloads (ET-5). */
async function withFullPayloads(
  tx: DbTx,
  session: GlobalQuizSessionDto,
): Promise<GlobalQuizSessionDto> {
  const payloads = await fullPayloads(
    tx,
    session.items.map((item) => item.brickVersionId),
  );
  return {
    ...session,
    items: session.items.map((item) => ({
      ...item,
      payload: payloads.get(item.brickVersionId) ?? item.payload,
    })),
  };
}

/**
 * ET-5 — builds the pack of the day. `services.globalQuiz.getToday` is called for each active
 * formation (idempotent creation), the session items receive their full payload and the extra
 * cards of tomorrow are attached. A formation without any due notion has an empty item list.
 */
export function buildPack(ctx: ServiceContext): Promise<Result<OfflinePackResponse>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return db.run(async (tx) => {
      const timeZone = await profileTimeZone(tx, userId);
      const now = ctx.clock.now();
      const today = userLocalDay(now, timeZone);
      const formations = await listActiveFormations(tx, userId);
      const packs: OfflinePack[] = [];
      for (const formation of formations) {
        const session = await getOrCreateTodaySession(ctx, formation.id, 'full');
        if (!session.ok) {
          if (session.error.code === 'NOT_FOUND') continue;
          throw session.error;
        }
        const withPayloads = await withFullPayloads(tx, session.value);
        const seen = new Set(withPayloads.items.flatMap((item) => item.notionIds));
        packs.push({
          formationId: formation.id,
          formationTitle: formation.title,
          session: withPayloads,
          extraCards: await extraCardsOf(tx, userId, formation.id, timeZone, today, seen),
        });
      }
      // ET-5 — the pack stays valid until the end of the next local day (CL-4).
      const expiresAt = endOfUserDay(addCivilDays(today, 1), timeZone);
      return OfflinePackResponseSchema.parse({
        ownerId: userId,
        localDate: today,
        generatedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        formations: packs,
      });
    });
  });
}
