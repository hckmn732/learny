// Vitest [SPEC-3203] — agenda contre la pile locale : période, filtre, propositions et déplacement
// (CA-3, CA-4 ; BR-AGE-01, BR-AGE-05, ET-1, ET-3).
//
// Requires `pnpm dev:up`, the demonstration seed (`pnpm db:seed:demo`), the API on
// http://127.0.0.1:3001 with `LLM_MODE=mock`, and the demonstration account prepared by
// `node apps/mobile/e2e/prepare-demo-user.mjs` (password from `MOBILE_DEMO_PASSWORD`).
// The caller sources `.env.local` so the anonymous key of the local Supabase stack is available:
//   set -a; . ./.env.local; set +a; node tools/sdd/validate.mjs SPEC-3203
//
// The move is applied then undone with the version returned by the API, so the demonstration
// agenda is left in the state the Maestro campaign and the visual baseline expect (CA-4).
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

import type { AgendaDto, AgendaSlot } from '@learny/contracts';

import { createMobileApiClient } from '../../src/api/client';

const ENV = process.env as Record<string, string | undefined>;
const SUPABASE_URL =
  ENV.MOBILE_SUPABASE_URL ?? ENV.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = ENV.MOBILE_SUPABASE_ANON_KEY ?? ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const API_URL = ENV.MOBILE_API_URL ?? 'http://127.0.0.1:3001';
const DEMO_EMAIL = ENV.MOBILE_DEMO_EMAIL ?? 'alex.perrin@demo.learny.test';
const DEMO_PASSWORD = ENV.MOBILE_DEMO_PASSWORD ?? 'learny-demo-3003';

/** Week of the mockup: Monday 9 to Sunday 15 November 2026. */
const FROM = '2026-11-09';
const TO = '2026-11-15';

/** Titles of the four activities of Wednesday 11 November (SPEC-115). */
const WEDNESDAY_TITLES = ['Relecture ciblée', 'Échauffement', 'Quiz de validation', 'Quiz global'];

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
let week: AgendaDto;

beforeAll(async () => {
  client = await signedInClient();
  week = await client.api.agendaGet({ query: { from: FROM, to: TO, formation: 'all' } });
});

function movableSlot(agenda: AgendaDto): AgendaSlot | undefined {
  // Un créneau d'un autre jour que la maquette : le déplacement de la preuve ne touche jamais
  // la journée de référence du comparatif visuel (CA-5).
  return (
    agenda.slots.find(
      (slot) => slot.movable && slot.status === 'planned' && slot.date !== '2026-11-11',
    ) ?? agenda.slots.find((slot) => slot.movable && slot.status === 'planned')
  );
}

describe('[SPEC-3203] agenda contre la pile locale', () => {
  it('lit la semaine de la maquette dans le fuseau de l’apprenant (ET-1, CA-1)', () => {
    expect(week.timezone).toBe('Europe/Paris');
    expect(week.today).toBe('2026-11-11');
    // Les bornes sont l'union des périodes des formations (ADR-0183), pas la semaine demandée.
    expect(week.bounds).not.toBeNull();
    expect((week.bounds?.start ?? '9999') <= '2026-11-09').toBe(true);
    expect((week.bounds?.end ?? '0000') >= '2026-11-15').toBe(true);
    expect(week.formations.length).toBeGreaterThanOrEqual(3);
    expect(week.slots.length).toBeGreaterThanOrEqual(4);

    for (const slot of week.slots) {
      expect(slot.date >= FROM && slot.date <= TO).toBe(true);
      expect(slot.startMinutes).toBeGreaterThanOrEqual(0);
      expect(slot.startMinutes).toBeLessThan(1440);
      expect(slot.href.startsWith('/')).toBe(true);
    }

    const wednesday = week.slots.filter((slot) => slot.date === '2026-11-11');
    const titles = wednesday.map((slot) => slot.title);
    for (const title of WEDNESDAY_TITLES) {
      expect(titles).toContain(title);
    }
    const course = wednesday.find((slot) => slot.title === 'Relecture ciblée');
    expect(course?.startMinutes).toBe(540);
    expect(course?.status).toBe('done');
    expect(week.totals.plannedMinutes).toBeGreaterThan(0);
  });

  it('filtre les créneaux par formation et rend un filtre vide (CA-3)', async () => {
    const first = week.slots[0];
    expect(first).toBeDefined();
    if (first === undefined) return;

    const filtered = await client.api.agendaGet({
      query: { from: FROM, to: TO, formation: first.formationId },
    });
    expect(filtered.slots.length).toBeGreaterThan(0);
    expect(filtered.slots.every((slot) => slot.formationId === first.formationId)).toBe(true);

    // Une formation de la réponse sans activité sur cette semaine rend l'état vide (EF-8).
    const emptyFormation = filtered.formations.find(
      (formation) => !week.slots.some((slot) => slot.formationId === formation.id),
    );
    if (emptyFormation !== undefined) {
      const empty = await client.api.agendaGet({
        query: { from: FROM, to: TO, formation: emptyFormation.id },
      });
      expect(empty.slots).toHaveLength(0);
    }
  });

  it('propose trois créneaux compatibles puis déplace l’activité (CA-4, BR-AGE-05)', async () => {
    const slot = movableSlot(week);
    expect(slot).toBeDefined();
    if (slot === undefined) return;

    const proposals = await client.api.slotAlternativesGet({ params: { sid: slot.id } });
    expect(proposals.slotId).toBe(slot.id);
    expect(proposals.version.length).toBeGreaterThan(0);
    expect(proposals.alternatives.length).toBeGreaterThan(0);
    expect(proposals.alternatives.length).toBeLessThanOrEqual(3);
    expect(proposals.timezone).toBe('Europe/Paris');

    const target = proposals.alternatives[0];
    expect(target).toBeDefined();
    if (target === undefined) return;

    const moved = await client.api.slotMove({
      params: { sid: slot.id },
      body: {
        expectedVersion: proposals.version,
        startsAt: target.startsAt,
        endsAt: target.endsAt,
      },
    });
    expect(moved.movedSlot.title).toBe(slot.title);
    expect(moved.movedSlot.date).toBe(target.date);
    expect(moved.movedSlot.startMinutes).toBe(target.startMinutes);
    expect(moved.replacedSlotId).toBe(slot.id);
    expect(moved.explanation.length).toBeGreaterThan(0);

    // L'agenda relu porte le déplacement : la même activité, à la nouvelle heure (CA-4).
    // La fenêtre de relecture couvre la proposition choisie, fût-elle la semaine suivante.
    const after = await client.api.agendaGet({
      query: { from: FROM, to: '2026-11-22', formation: 'all' },
    });
    const replaced = after.slots.find((item) => item.id === slot.id);
    expect(replaced).toBeUndefined();
    const relocated = after.slots.find((item) => item.id === moved.movedSlot.id);
    expect(relocated?.title).toBe(slot.title);

    // Remise en place : le jeu de démonstration reste celui de la maquette.
    const restored = await client.api.slotMove({
      params: { sid: moved.movedSlot.id },
      body: {
        expectedVersion: moved.version,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      },
    });
    expect(restored.movedSlot.date).toBe(slot.date);
    expect(restored.movedSlot.startMinutes).toBe(slot.startMinutes);
  });
});
