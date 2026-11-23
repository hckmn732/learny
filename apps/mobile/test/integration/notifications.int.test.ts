// Vitest [SPEC-3102] — centre de notifications contre la pile locale (CA-2, ET-3, BR-NOT-01).
//
// Requires `pnpm dev:up`, the demonstration seed (`pnpm db:seed:demo`), the API on
// http://127.0.0.1:3001 with `LLM_MODE=mock`, and the demonstration account prepared by
// `node apps/mobile/e2e/prepare-demo-user.mjs` (password from `MOBILE_DEMO_PASSWORD`).
// The caller sources `.env.local` so the anonymous key of the local Supabase stack is available:
//   set -a; . ./.env.local; set +a; node tools/sdd/validate.mjs SPEC-3102
//
// The test leaves the inbox in the state the Maestro campaign expects: the three unread rows of
// the mockup (`validation_soon`, `course_ready`, `session_to_reschedule`) are recreated through
// the demonstration route after the read-all check, so the pastille shows 3 again (CA-2).
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

import type { DevNotifySettings } from '@learny/contracts';

import { createMobileApiClient } from '../../src/api/client';

const ENV = process.env as Record<string, string | undefined>;
const SUPABASE_URL =
  ENV.MOBILE_SUPABASE_URL ?? ENV.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = ENV.MOBILE_SUPABASE_ANON_KEY ?? ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const API_URL = ENV.MOBILE_API_URL ?? 'http://127.0.0.1:3001';
const DEMO_EMAIL = ENV.MOBILE_DEMO_EMAIL ?? 'alex.perrin@demo.learny.test';
const DEMO_PASSWORD = ENV.MOBILE_DEMO_PASSWORD ?? 'learny-demo-3003';

const SETTINGS: DevNotifySettings = {
  channelEmail: true,
  channelPush: false,
  typeRevision: true,
  typeValidation: true,
  typeCourse: true,
  typeGap: true,
  typePlanning: true,
  typeRelaunch: true,
  quietStart: '21:00',
  quietEnd: '08:00',
  weekendQuiet: true,
  maxPerDay: 8,
};

/** The three unread rows of the mockup, in the order the pastille counts them. */
const MOCKUP_ROWS = ['validation_soon', 'course_ready', 'session_to_reschedule'] as const;

async function signedInClient() {
  if (ANON_KEY === '') {
    throw new Error(
      'Clé anonyme Supabase absente : sourcer .env.local (set -a; . ./.env.local; set +a) et lancer pnpm dev:up.',
    );
  }
  const auth = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const signedIn = await auth.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (signedIn.error !== null) {
    throw new Error(
      `Connexion du compte de démonstration impossible (${signedIn.error.message}) : lancer node apps/mobile/e2e/prepare-demo-user.mjs.`,
    );
  }
  const accessToken = signedIn.data.session.access_token;
  return createMobileApiClient({
    apiUrl: API_URL,
    token: { get: () => accessToken, refresh: () => Promise.resolve(false) },
  });
}

let client: Awaited<ReturnType<typeof signedInClient>>;

beforeAll(async () => {
  client = await signedInClient();
});

describe('[SPEC-3102] centre de notifications contre la pile locale', () => {
  it('lit la page des notifications, son fuseau et ses groupes (CA-2, BR-NOT-01)', async () => {
    const page = await client.api.notificationsList({ query: { filter: 'all', limit: 50 } });
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.timezone.length).toBeGreaterThan(0);
    expect(page.total).toBeGreaterThanOrEqual(page.items.length);
    for (const item of page.items) {
      expect(['today', 'yesterday', 'earlier']).toContain(item.group);
      expect(item.href.startsWith('/')).toBe(true);
    }
    // Nouvelle d'abord (ET-1) : les dates décroissent.
    const dates = page.items.map((item) => Date.parse(item.createdAt));
    expect([...dates].sort((left, right) => right - left)).toEqual(dates);
  });

  it('filtre les non lues sans changer le total (EF-3)', async () => {
    const all = await client.api.notificationsList({ query: { filter: 'all', limit: 50 } });
    const unread = await client.api.notificationsList({ query: { filter: 'unread', limit: 50 } });
    expect(unread.total).toBe(all.total);
    expect(unread.items.every((item) => item.readAt === null)).toBe(true);
    expect(unread.unreadCount).toBe(all.unreadCount);
    const count = await client.api.notificationsUnreadCount({});
    expect(count.count).toBe(all.unreadCount);
  });

  it('marque une notification lue, sans seconde écriture (CA-2)', async () => {
    const created = await client.api.devNotify({
      body: {
        type: 'weekly_review',
        tone: 'vous',
        at: '2026-11-11T12:20:00.000Z',
        settings: SETTINGS,
        dedupeKey: 'spec-3102-integration-lecture',
      },
    });
    const before = await client.api.notificationsUnreadCount({});

    const read = await client.api.notificationRead({ params: { id: created.notification.id } });
    expect(read.unreadCount).toBe(Math.max(0, before.count - (created.created ? 1 : 0)));

    const again = await client.api.notificationRead({ params: { id: created.notification.id } });
    expect(again.unreadCount).toBe(read.unreadCount);
  });

  it('marque tout lu d’un coup, puis rend l’état de la maquette à la campagne (CA-2)', async () => {
    const readAll = await client.api.notificationsReadAll({});
    expect(readAll.unreadCount).toBe(0);
    const unread = await client.api.notificationsList({ query: { filter: 'unread', limit: 50 } });
    expect(unread.items).toHaveLength(0);

    // La campagne Maestro attend trois non lues : on les recrée par la route de démonstration.
    for (const [index, type] of MOCKUP_ROWS.entries()) {
      await client.api.devNotify({
        body: {
          type,
          tone: 'vous',
          at: '2026-11-11T12:20:00.000Z',
          settings: SETTINGS,
          dedupeKey: `spec-3102-integration-${String(index)}-${type}`,
        },
      });
    }
    const restored = await client.api.notificationsUnreadCount({});
    expect(restored.count).toBe(MOCKUP_ROWS.length);
  });
});
