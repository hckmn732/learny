// Vitest [SPEC-3303] — discussion avec le tuteur contre la pile locale (CA-1, CA-2, CA-5).
//
// Requires `pnpm dev:up`, the demonstration seed, the API on http://127.0.0.1:3001 with
// `LLM_MODE=mock` and the demonstration account prepared by
// `node apps/mobile/e2e/prepare-demo-user.mjs`. Source `.env.local` before the run:
//   set -a; . ./.env.local; set +a; node tools/sdd/validate.mjs SPEC-3303 --skip-build
//
// The test opens a conversation of its own on the seeded course and deletes it in `afterAll` with
// the service role: the demonstration dataset read by the Maestro campaign and by the visual
// baseline is left exactly as it was (no `db:reset`, no mutation of the seed).
//
// CA-3: the contract has no `POST /tutor/cards`; the recall card is the `card_created` proposal of
// the `questions_cartes` automation, accepted through `meAutomationActionAccept` (SPEC-717,
// ADR-0193 § 4). The test proves that a fresh conversation exposes no phantom proposal, so the
// sheet only offers « Créer une carte » when the server actually drafted one.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isActiveProgramme } from '@learny/contracts';

import { createMobileApiClient } from '../../src/api/client';
import { apiTutorClient } from '../../src/features/tuteur/tutor-client';

const ENV = process.env as Record<string, string | undefined>;
const SUPABASE_URL =
  ENV.MOBILE_SUPABASE_URL ?? ENV.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = ENV.MOBILE_SUPABASE_ANON_KEY ?? ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY ?? '';
const API_URL = ENV.MOBILE_API_URL ?? 'http://127.0.0.1:3001';
const DEMO_EMAIL = ENV.MOBILE_DEMO_EMAIL ?? 'alex.perrin@demo.learny.test';
const DEMO_PASSWORD = ENV.MOBILE_DEMO_PASSWORD ?? 'learny-demo-3003';
const EVIDENCE = path.resolve(__dirname, '../../../../evidence/SPEC-3303');

async function accessToken(): Promise<string> {
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
  return signedIn.data.session.access_token;
}

function clientWith(token: string, fetchImpl?: typeof fetch) {
  return createMobileApiClient({
    apiUrl: API_URL,
    token: { get: () => token, refresh: () => Promise.resolve(false) },
    ...(fetchImpl === undefined ? {} : { fetchImpl }),
  });
}

interface Captured {
  readonly url: string;
  readonly body: unknown;
}

let token = '';
let client: ReturnType<typeof clientWith>;
let courseId = '';
let chapterId = '';
let createdConversationId: string | null = null;
let seedLearnerQuestion = '';

beforeAll(async () => {
  token = await accessToken();
  client = clientWith(token);

  const me = await client.api.meGet({});
  const sidebar = await client.api.sidebarGet({});
  const formationId = me.currentFormationId ?? sidebar.currentFormation?.id ?? null;
  if (formationId === null)
    throw new Error('Aucune formation courante pour le compte de démonstration.');
  const programme = await client.api.programmeGet({ params: { fid: formationId } });
  if (!isActiveProgramme(programme)) throw new Error('Programme actif attendu sur la démo.');
  const open = programme.modules.find((module) => module.status === 'open');
  if (open === undefined) throw new Error('Aucun module ouvert dans la démo.');
  const screen = await client.api.moduleCourse({ params: { mid: open.id } });
  if (screen.course === null) throw new Error('Cours généré attendu sur le module ouvert.');
  courseId = screen.course.id;
  chapterId = screen.course.chapter.id;
}, 120_000);

afterAll(async () => {
  if (createdConversationId === null || SERVICE_KEY === '') return;
  const service = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  await service.from('tutor_messages').delete().eq('conversation_id', createdConversationId);
  await service.from('tutor_conversations').delete().eq('id', createdConversationId);
}, 120_000);

describe('[SPEC-3303] discussion avec le tuteur contre la pile locale', () => {
  it('recharge la dernière discussion du cours et son historique (CA-2, BR-TUT-07)', async () => {
    const list = await client.api.courseConversationList({ params: { cid: courseId } });
    expect(list.items.length).toBeGreaterThan(0);
    const latest = list.items[0];
    expect(latest).toBeDefined();
    if (latest === undefined) return;
    const conversation = await client.api.conversationGet({ params: { id: latest.id } });
    expect(conversation.id).toBe(latest.id);
    expect(conversation.messages.length).toBeGreaterThan(0);
    const learner = conversation.messages.find((message) => message.role === 'learner');
    expect(learner).toBeDefined();
    seedLearnerQuestion = learner?.content ?? '';
    expect(seedLearnerQuestion.length).toBeGreaterThan(0);
    // Six keys at most (ADR-0178 § 1): the server only lists the ones it could build.
    expect(conversation.contextItems.length).toBeGreaterThanOrEqual(3);
    expect(conversation.contextItems.length).toBeLessThanOrEqual(6);
  });

  it('ouvre une discussion et reçoit la réponse en flux avec ses sources et ses suites (CA-1)', async () => {
    const conversation = await client.api.courseConversationCreate(
      { params: { cid: courseId }, body: { chapterId } },
      { idempotencyKey: randomUUID() },
    );
    createdConversationId = conversation.id;
    expect(conversation.messages.length).toBeGreaterThan(0);
    expect(conversation.contextItems.length).toBeGreaterThanOrEqual(3);
    expect(conversation.contextItems.length).toBeLessThanOrEqual(6);

    const deltas: string[] = [];
    let sources = 0;
    let followUps = 0;
    for await (const part of client.streamTutorReply(conversation.id, {
      text: 'Pourquoi deux dates sur une pièce ?',
      context: { include: { formation: true, chapter: true, profile: true } },
    })) {
      if (part.type === 'text-delta') deltas.push(part.delta);
      if (part.type === 'data-sources') sources = part.data.sources.length;
      if (part.type === 'data-follow-ups') followUps = part.data.followUps.length;
    }
    expect(deltas.length).toBeGreaterThan(0);
    expect(deltas.join('').length).toBeGreaterThan(40);
    expect(sources).toBeGreaterThan(0);
    expect(followUps).toBeGreaterThan(0);

    // L'historique conservé par le serveur contient la question et la réponse complète (CA-2).
    const stored = await client.api.conversationGet({ params: { id: conversation.id } });
    expect(stored.messages.some((message) => message.role === 'learner')).toBe(true);
    const answer = stored.messages.filter((message) => message.role === 'tutor').at(-1);
    expect(answer?.content).toBe(deltas.join(''));
    expect(answer?.sources.length ?? 0).toBeGreaterThan(0);
  }, 60_000);

  it('n’envoie que les éléments inclus du contexte (CA-5)', async () => {
    if (createdConversationId === null) throw new Error('Discussion de test absente.');
    const captured: Captured[] = [];
    const captureFetch: typeof fetch = async (input, init) => {
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null;
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      captured.push({ url, body });
      return fetch(input as RequestInfo, init);
    };
    const capturing = clientWith(token, captureFetch);

    const deltas: string[] = [];
    for await (const part of capturing.streamTutorReply(createdConversationId, {
      text: 'Et la date de saisie ?',
      context: { include: { formation: true, chapter: false, profile: false } },
    })) {
      if (part.type === 'text-delta') deltas.push(part.delta);
    }
    expect(deltas.length).toBeGreaterThan(0);

    const message = captured.find((entry) => entry.url.includes('/messages'));
    expect(message).toBeDefined();
    const body = message?.body as { context?: { include?: Record<string, boolean> } } | null;
    expect(body?.context?.include).toEqual({ formation: true, chapter: false, profile: false });
    // Preuve versionnée du corps de la requête (contexte) exigée par le § 13 de la spécification.
    fs.mkdirSync(EVIDENCE, { recursive: true });
    fs.writeFileSync(
      path.join(EVIDENCE, 'tutor-context-request.json'),
      `${JSON.stringify(
        {
          spec: 'SPEC-3303',
          capturedAt: '2026-11-11T12:20:00.000Z',
          note: 'Corps de la requête SSE envoyée à POST /api/v1/conversations/:id/messages : le chapitre retiré part à false.',
          body: message?.body ?? null,
        },
        null,
        2,
      )}\n`,
    );
  }, 60_000);

  it('n’expose aucune carte sans proposition du serveur (CA-3, BR-AUT-06)', async () => {
    if (createdConversationId === null) throw new Error('Discussion de test absente.');
    const tutorClient = apiTutorClient(client);
    const proposals = await tutorClient.listCardProposals(createdConversationId);
    expect(proposals).toEqual([]);
    // Le filtre du journal ne renvoie que des `card_created` en attente de consentement.
    const journal = await client.api.meAutomationActionsList({
      query: { kind: 'card_created', status: 'pending_consent', limit: 100 },
    });
    expect(journal.items.every((item) => item.kind === 'card_created')).toBe(true);
    expect(journal.items.every((item) => item.status === 'pending_consent')).toBe(true);
  }, 60_000);
});
