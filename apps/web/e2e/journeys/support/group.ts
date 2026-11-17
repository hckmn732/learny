// SPEC-807 EF-4 — isolated data of the group journey (ET-2). Declared initial fixtures only: two
// fresh accounts, the owner's active formation (SPEC-115 factories) and the owner's own progress.
// Everything else — group, invitation, apports, departure — is done through the product.
import { randomBytes } from 'node:crypto';

import type { Browser, BrowserContext, Page } from '@playwright/test';

import { activeLegalVersions } from '@learny/config';
import { serviceDb, sql } from '@learny/db';
import { createFormation, createModule, createNotion } from '@learny/testing';
import { FIXED_TIME_ISO } from '@learny/testing/clock';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';

export interface GroupJourney {
  tag: string;
  owner: TestSession;
  member: TestSession;
  ownerName: string;
  memberName: string;
  formationId: string;
  title: string;
  modules: { id: string; title: string; chapterId: string }[];
}

const MODULE_TITLES = ['Fondamentaux du contrôle de gestion', 'Calcul des coûts complets'];

/** Two accounts unique to this run: the owner (onboarding done) and an invitee at « Départ ». */
export async function seedGroupJourney(): Promise<GroupJourney> {
  const tag = randomBytes(4).toString('hex');
  const owner = await createTestSession({ email: `journey-group-owner-${tag}@test.learny.test` });
  const member = await createTestSession({ email: `journey-group-member-${tag}@test.learny.test` });
  const ownerName = 'Maëlle';
  const memberName = 'Thibault';
  const title = `Contrôle de gestion à plusieurs ${tag}`;

  // SPEC-806 — the server guard of formation mutations refuses an account that has not
  // accepted the active legal versions (as the demonstration accounts are pre-seeded).
  const legal = activeLegalVersions();
  const seeded = await serviceDb().transaction(async (tx) => {
    for (const userId of [owner.userId, member.userId]) {
      await tx.execute(sql`
        insert into public.legal_acceptances (user_id, document, version)
        values
          (${userId}::uuid, 'cgu', ${legal.cgu}),
          (${userId}::uuid, 'privacy', ${legal.privacy})
        on conflict do nothing
      `);
    }
    await tx.execute(sql`
      update public.profiles
      set first_name = ${ownerName}, onboarding_step = 'done', timezone = 'Europe/Paris',
          streak_days = 9
      where id = ${owner.userId}::uuid
    `);
    // The invitee stops at the last onboarding step, where an invitation code can be entered.
    await tx.execute(sql`
      update public.profiles
      set first_name = ${memberName}, onboarding_step = 'depart', timezone = 'Europe/Paris',
          streak_days = 0
      where id = ${member.userId}::uuid
    `);
    const formation = await createFormation(tx, {
      ownerId: owner.userId,
      title,
      status: 'active',
      volumeHours: 20,
      startDate: '2026-10-01',
      endDate: '2026-11-30',
    });
    const modules: GroupJourney['modules'] = [];
    for (const [index, moduleTitle] of MODULE_TITLES.entries()) {
      const created = await createModule(tx, {
        ownerId: owner.userId,
        formationId: formation.id,
        position: index + 1,
        title: moduleTitle,
        chapters: [`${moduleTitle} — chapitre 1`],
        plannedStart: index === 0 ? '2026-10-01' : '2026-11-01',
        plannedEnd: index === 0 ? '2026-10-31' : '2026-11-30',
        status: index === 0 ? 'validated' : 'open',
      });
      await createNotion(tx, {
        ownerId: owner.userId,
        formationId: formation.id,
        moduleId: created.id,
        label: `Notion ${String(index + 1)}`,
      });
      modules.push({ id: created.id, title: moduleTitle, chapterId: created.chapterIds[0] ?? '' });
    }
    // The owner's own progress: module 1 validated, module 2 open (BR-GRP-04: personal rows).
    await tx.execute(sql`
      insert into public.module_progress (user_id, module_id, status, opened_at, validated_at)
      values
        (${owner.userId}::uuid, ${modules[0]?.id ?? ''}::uuid, 'validated',
         ${FIXED_TIME_ISO}::timestamptz, ${FIXED_TIME_ISO}::timestamptz),
        (${owner.userId}::uuid, ${modules[1]?.id ?? ''}::uuid, 'open',
         ${FIXED_TIME_ISO}::timestamptz, null)
    `);
    await tx.execute(sql`
      update public.profiles set current_formation_id = ${formation.id}::uuid
      where id = ${owner.userId}::uuid
    `);
    return { formationId: formation.id, modules };
  });

  return { tag, owner, member, ownerName, memberName, title, ...seeded };
}

/** Removes every row of the journey (CL-2): groups first, then formations, then the accounts. */
export async function cleanupGroupJourney(journey: GroupJourney | null): Promise<void> {
  if (journey === null) return;
  for (const session of [journey.member, journey.owner]) {
    await serviceDb().execute(
      sql`delete from public.groups where owner_id = ${session.userId}::uuid`,
    );
    await serviceDb().execute(
      sql`delete from public.formations where owner_id = ${session.userId}::uuid`,
    );
    await deleteTestSession(session);
  }
}

/** Signs a browser context in with a real Supabase session and freezes its page clock. */
export async function signIn(
  context: BrowserContext,
  page: Page,
  baseURL: string,
  session: TestSession,
): Promise<void> {
  await context.addCookies(session.cookies.map((cookie) => ({ ...cookie, url: baseURL })));
  await page.clock.setFixedTime(new Date(FIXED_TIME_ISO));
}

/** Second, fully separate browser context (own cookies, own network address, own video). */
export async function openSecondContext(
  browser: Browser,
  baseURL: string,
  videoDir: string,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } },
  });
  const octet = () => String(Math.floor(Math.random() * 256));
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `10.${octet()}.${octet()}.${octet()}` });
  return context;
}

/** The access token @supabase/ssr stores in the session cookie (possibly chunked, base64). */
export function accessTokenOf(session: TestSession): string {
  const chunks = session.cookies
    .filter((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => {
      const index = (name: string) => Number(/\.(\d+)$/.exec(name)?.[1] ?? '0');
      return index(a.name) - index(b.name);
    });
  let raw = chunks.map((cookie) => cookie.value).join('');
  if (raw.startsWith('base64-')) raw = Buffer.from(raw.slice(7), 'base64url').toString('utf8');
  const token = (JSON.parse(raw) as { access_token?: string }).access_token;
  if (token === undefined) throw new Error('Jeton de session introuvable dans les cookies.');
  return token;
}

/** Storage path of an apport, read for the direct-link attempt (assertion only, no write). */
export async function storagePathOf(resourceId: string): Promise<string> {
  const rows = await serviceDb().execute<{ storage_path: string | null }>(sql`
    select storage_path from public.resources where id = ${resourceId}::uuid
  `);
  const path = rows[0]?.storage_path ?? null;
  if (path === null) throw new Error(`Apport ${resourceId} sans fichier stocké.`);
  return path;
}
