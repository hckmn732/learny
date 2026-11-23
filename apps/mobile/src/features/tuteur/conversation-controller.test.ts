// Vitest [SPEC-3303] — contrôleur de la discussion : création idempotente, flux, arrêt, reprise,
// contexte, Teste-moi et carte (CA-1, CA-4, CA-5, CL-2, CL-3, ET-1, ET-2).
//
// The client is faked: every call is recorded, the stream is a real async generator whose frames
// the test controls, and the idempotency registry is a plain map. No device, no network.
import { describe, expect, it } from 'vitest';

import type { TutorReplyPart } from '@learny/api-client';
import { StreamInterruptedError } from '@learny/api-client';
import type {
  AutomationActionItem,
  ConversationDto,
  ConversationSummaryDto,
  SelfTestAnswerDto,
  SendMessageInput,
  TutorMessageDto,
} from '@learny/contracts';
import { AppError } from '@learny/core';

import { ConversationController, errorCodeOf, type TutorClient } from './conversation-controller';

const CONTEXT_ITEMS = [
  { key: 'formation' as const, label: 'Formation', value: 'SAP S/4HANA Finance', included: true },
  { key: 'chapter' as const, label: 'Chapitre', value: 'Saisie des pièces', included: true },
  { key: 'profile' as const, label: 'Profil', value: 'Vouvoiement', included: false },
];

function message(patch: Partial<TutorMessageDto> = {}): TutorMessageDto {
  return {
    id: 'm-1',
    role: 'tutor',
    content: 'Bonjour, posez votre question.',
    sources: [],
    followUps: [],
    selfTest: null,
    createdAt: '2026-11-11T12:20:00.000Z',
    ...patch,
  };
}

function conversation(patch: Partial<ConversationDto> = {}): ConversationDto {
  return {
    id: 'c-1',
    courseId: 'course-1',
    chapterId: 'chapter-1',
    title: null,
    createdAt: '2026-11-11T12:20:00.000Z',
    messages: [message()],
    contextItems: CONTEXT_ITEMS,
    pendingSelfTest: false,
    ...patch,
  };
}

const CARD: AutomationActionItem = {
  id: 'a-card',
  automation: 'questions_cartes',
  kind: 'card_created',
  summary: 'Question devenue carte',
  formationId: null,
  payload: {
    conversationId: 'c-1',
    question: 'Pourquoi deux dates ?',
    answer: 'La date de pièce fixe la période.',
    notionLabel: 'Date de pièce',
    sourceLabel: 'Chapitre 2',
  },
  undoPayload: null,
  requiresConsent: true,
  status: 'pending_consent',
  decidedAt: null,
  createdAt: '2026-11-11T12:20:00.000Z',
};

interface FakeOptions {
  readonly existing?: readonly ConversationSummaryDto[];
  readonly stream?: (signal: AbortSignal | undefined) => AsyncGenerator<TutorReplyPart>;
  readonly cards?: readonly AutomationActionItem[];
}

function fakeClient(options: FakeOptions = {}) {
  const calls = {
    list: [] as string[],
    get: [] as string[],
    create: [] as { courseId: string; chapterId: string; key: string }[],
    streams: [] as { id: string; body: SendMessageInput }[],
    selfTests: [] as { id: string; text: string }[],
    accepts: [] as { id: string; key: string }[],
    cards: [] as string[],
  };
  let created: ConversationDto = conversation({ messages: [] });

  const client: TutorClient = {
    listConversations: (courseId) => {
      calls.list.push(courseId);
      return Promise.resolve({ items: options.existing ?? [] });
    },
    getConversation: (id) => {
      calls.get.push(id);
      return Promise.resolve(conversation({ id }));
    },
    createConversation: (courseId, chapterId, key) => {
      calls.create.push({ courseId, chapterId, key });
      return Promise.resolve(created);
    },
    streamReply: (id, body, options2) => {
      calls.streams.push({ id, body });
      const generator = options.stream?.(options2.signal) ?? emptyStream();
      return generator;
    },
    answerSelfTest: (id, text): Promise<SelfTestAnswerDto> => {
      calls.selfTests.push({ id, text });
      return Promise.resolve({ message: message({ id: 'm-correction', content: 'Juste.' }) });
    },
    listCardProposals: (conversationId) => {
      calls.cards.push(conversationId);
      return Promise.resolve(options.cards ?? []);
    },
    acceptCard: (id, key) => {
      calls.accepts.push({ id, key });
      return Promise.resolve({ ...CARD, status: 'applied' });
    },
  };

  return {
    client,
    calls,
    setCreated: (value: ConversationDto) => {
      created = value;
    },
  };
}

async function* emptyStream(): AsyncGenerator<TutorReplyPart> {
  await Promise.resolve();
  yield { type: 'text-delta', id: 'tutor', delta: 'Réponse.' };
  yield { type: 'data-sources', data: { sources: [{ label: 'Chapitre 2' }] } };
  yield { type: 'data-follow-ups', data: { followUps: [{ key: 'example', label: 'Un exemple' }] } };
}

function controllerOf(fake: ReturnType<typeof fakeClient>) {
  const keys = new Map<string, string>();
  const resolved: string[] = [];
  let ids = 0;
  const frames: (() => void)[] = [];
  const controller = new ConversationController({
    client: fake.client,
    courseId: 'course-1',
    chapterId: 'chapter-1',
    keyFor: (intent) => {
      const existing = keys.get(intent);
      if (existing !== undefined) return existing;
      const key = `key-${String(keys.size + 1)}`;
      keys.set(intent, key);
      return key;
    },
    resolveKey: (intent) => {
      resolved.push(intent);
      keys.delete(intent);
    },
    newId: () => {
      ids += 1;
      return `id-${String(ids)}`;
    },
    // A frame is run by the test: the grouping is observable (CL-5).
    schedule: (run) => {
      frames.push(run);
    },
  });
  return { controller, frames, keys, resolved };
}

describe('[SPEC-3303] contrôleur : ouverture de la discussion', () => {
  it('reprend la dernière discussion du cours sans en créer une (BR-TUT-07, CL-3)', async () => {
    const fake = fakeClient({
      existing: [
        {
          id: 'c-9',
          title: null,
          createdAt: '2026-11-11T12:20:00.000Z',
          lastMessageAt: '2026-11-11T12:21:00.000Z',
        },
      ],
    });
    const { controller } = controllerOf(fake);
    await controller.load();
    expect(fake.calls.list).toEqual(['course-1']);
    expect(fake.calls.get).toEqual(['c-9']);
    expect(fake.calls.create).toHaveLength(0);
    expect(controller.getSnapshot().conversationId).toBe('c-9');
    expect(controller.getSnapshot().contextItems).toHaveLength(3);
    expect(controller.getSnapshot().include).toEqual({
      formation: true,
      chapter: true,
      profile: false,
    });
  });

  it('n’ouvre aucune discussion à la simple ouverture (ET-1, CL-3)', async () => {
    const fake = fakeClient({ existing: [] });
    const { controller } = controllerOf(fake);
    await controller.load();
    expect(fake.calls.create).toHaveLength(0);
    expect(controller.getSnapshot().status).toBe('ready');
    expect(controller.getSnapshot().messages).toEqual([]);
    expect(controller.getSnapshot().conversationId).toBeNull();

    // « Nouvelle discussion » ne crée rien non plus : la première question ouvre la discussion,
    // avec une clé d'idempotence libérée après succès (ET-1).
    controller.newDiscussion();
    expect(fake.calls.create).toHaveLength(0);
  });

  it('ouvre la discussion à la première question, avec une clé libérée après succès (ET-1)', async () => {
    const fake = fakeClient({ existing: [] });
    fake.setCreated(conversation({ id: 'c-new', messages: [message()] }));
    const { controller, resolved } = controllerOf(fake);
    await controller.load();
    await controller.send('Pourquoi deux dates ?');
    expect(fake.calls.create).toEqual([
      { courseId: 'course-1', chapterId: 'chapter-1', key: 'key-1' },
    ]);
    expect(resolved).toEqual(['tutor:create:course-1:chapter-1']);
    expect(controller.getSnapshot().conversationId).toBe('c-new');
    // L'accueil du serveur precede la question, puis la reponse diffusee ferme le fil.
    expect(controller.getSnapshot().messages.map((entry) => entry.role)).toEqual([
      'tutor',
      'learner',
      'tutor',
    ]);
  });
});

describe('[SPEC-3303] contrôleur : flux et interruption', () => {
  it('diffuse la réponse, ses sources et ses suites (CA-1)', async () => {
    const fake = fakeClient({ existing: [] });
    const { controller, frames } = controllerOf(fake);
    fake.setCreated(conversation({ id: 'c-1', messages: [] }));
    await controller.load();

    await controller.send('Pourquoi deux dates ?');

    const snapshot = controller.getSnapshot();
    expect(fake.calls.streams).toHaveLength(1);
    expect(fake.calls.streams[0]?.body.text).toBe('Pourquoi deux dates ?');
    expect(snapshot.messages.map((entry) => entry.role)).toEqual(['learner', 'tutor']);
    expect(snapshot.messages[1]?.text).toBe('Réponse.');
    expect(snapshot.messages[1]?.sources).toEqual([{ label: 'Chapitre 2' }]);
    expect(snapshot.messages[1]?.followUps).toEqual([{ key: 'example', label: 'Un exemple' }]);
    expect(frames.length).toBeGreaterThan(0);
    expect(snapshot.busy).toBe(false);
  });

  it('ignore un double appui sur envoyer (CL-2)', async () => {
    const fake = fakeClient({ existing: [] });
    const { controller } = controllerOf(fake);
    await controller.load();
    const first = controller.send('Une question');
    const second = controller.send('Une autre question');
    await Promise.all([first, second]);
    expect(fake.calls.streams).toHaveLength(1);
    expect(controller.getSnapshot().messages.filter((m) => m.role === 'learner')).toHaveLength(1);
  });

  it('conserve le texte partiel sur « Arrêter » et le renvoie à la reprise (CA-4, ET-2)', async () => {
    let attempt = 0;
    const fake = fakeClient({
      existing: [],
      stream: (signal) => {
        attempt += 1;
        return attempt === 1 ? gatedStream(signal) : emptyStream();
      },
    });
    const { controller } = controllerOf(fake);
    await controller.load();
    const sending = controller.send('Pourquoi deux dates ?');
    await waitForBusy(controller);
    controller.stop();
    await sending;

    const interrupted = controller.getSnapshot().messages[1];
    expect(interrupted?.text).toBe('La date de pièce');
    expect(interrupted?.interrupted).toBe(true);
    expect(controller.getSnapshot().busy).toBe(false);

    // « Réessayer » renvoie la même question, sans doubler la bulle de l'apprenant.
    await controller.retry();
    const messages = controller.getSnapshot().messages;
    expect(messages.filter((m) => m.role === 'learner')).toHaveLength(1);
    expect(fake.calls.streams.map((call) => call.body.text)).toEqual([
      'Pourquoi deux dates ?',
      'Pourquoi deux dates ?',
    ]);
  });

  it('garde le texte partiel quand le réseau coupe le flux (CL-1)', async () => {
    const fake = fakeClient({
      existing: [],
      stream: () => cutStream(),
    });
    const { controller } = controllerOf(fake);
    await controller.load();
    await controller.send('Pourquoi deux dates ?');
    expect(controller.getSnapshot().messages[1]?.text).toBe('La date de pièce');
    expect(controller.getSnapshot().messages[1]?.interrupted).toBe(true);
    expect(controller.getSnapshot().error).toBeNull();
  });

  it('traduit un modèle absent en code d’action (EF-7)', async () => {
    const fake = fakeClient({
      existing: [],
      stream: () =>
        failingStream(
          new AppError('AI_UNAVAILABLE', 'Modèle absent.', {
            status: 422,
            reason: 'no_model_selected',
          }),
        ),
    });
    const { controller } = controllerOf(fake);
    await controller.load();
    await controller.send('Une question');
    expect(controller.getSnapshot().error).toEqual({
      code: 'AI_MODEL_MISSING',
      retryAfterSec: null,
    });
    // Aucune bulle vide : le fil ne garde que la question.
    expect(controller.getSnapshot().messages.map((m) => m.role)).toEqual(['learner']);
  });

  it('expose le délai d’un 429 (EF-7)', async () => {
    const fake = fakeClient({
      existing: [],
      stream: () =>
        failingStream(new AppError('RATE_LIMITED', 'Trop de questions.', { retryAfterSec: 42 })),
    });
    const { controller } = controllerOf(fake);
    await controller.load();
    await controller.send('Une question');
    expect(controller.getSnapshot().error).toEqual({ code: 'RATE_LIMITED', retryAfterSec: 42 });
  });
});

describe('[SPEC-3303] contrôleur : contexte, Teste-moi et carte', () => {
  it('n’envoie que les éléments inclus dans le contexte (CA-5)', async () => {
    const fake = fakeClient({
      existing: [
        {
          id: 'c-1',
          title: null,
          createdAt: '2026-11-11T12:20:00.000Z',
          lastMessageAt: '2026-11-11T12:21:00.000Z',
        },
      ],
    });
    const { controller } = controllerOf(fake);
    await controller.load();
    controller.toggleContext('chapter');
    await controller.send('Une question');
    expect(fake.calls.streams[0]?.body.context.include).toEqual({
      formation: true,
      chapter: false,
      profile: false,
    });
  });

  it('ajoute la correction d’un Teste-moi et clôt la question (BR-TUT-04)', async () => {
    const fake = fakeClient({ existing: [] });
    const { controller } = controllerOf(fake);
    await controller.load();
    await controller.send('Teste-moi');
    await controller.answerSelfTest('La date de pièce.');
    expect(fake.calls.selfTests).toEqual([{ id: 'c-1', text: 'La date de pièce.' }]);
    const messages = controller.getSnapshot().messages;
    expect(messages[messages.length - 1]?.text).toBe('Juste.');
    expect(controller.getSnapshot().selfTestPending).toBe(false);
  });

  it('propose la carte de la conversation et l’accepte avec une clé (CA-3, BR-AUT-06)', async () => {
    const fake = fakeClient({
      existing: [
        {
          id: 'c-1',
          title: null,
          createdAt: '2026-11-11T12:20:00.000Z',
          lastMessageAt: '2026-11-11T12:21:00.000Z',
        },
      ],
      cards: [CARD],
    });
    const { controller, resolved } = controllerOf(fake);
    await controller.load();
    expect(controller.getSnapshot().card?.id).toBe('a-card');
    const created = await controller.createCard();
    expect(created).toBe(true);
    expect(fake.calls.accepts).toEqual([{ id: 'a-card', key: 'key-1' }]);
    expect(resolved).toEqual(['tutor:card']);
    expect(controller.getSnapshot().cardCreated).toBe(true);
    expect(controller.getSnapshot().card).toBeNull();
  });

  it('classe les codes d’erreur du contrat (EF-7)', () => {
    expect(errorCodeOf(new AppError('NETWORK_ERROR', 'réseau'))).toBe('NETWORK');
    expect(
      errorCodeOf(new AppError('AI_UNAVAILABLE', 'modèle', { reason: 'credential_not_qualified' })),
    ).toBe('AI_MODEL_MISSING');
    expect(errorCodeOf(new AppError('AI_UNAVAILABLE', 'panne'))).toBe('AI_UNAVAILABLE');
    expect(errorCodeOf(new StreamInterruptedError())).toBe('STREAM');
    expect(errorCodeOf(new Error('inconnu'))).toBe('UNKNOWN');
  });
});

async function waitForBusy(controller: ConversationController): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (controller.getSnapshot().busy) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('Le contrôleur n’est jamais passé en diffusion.');
}

/** Stream that yields one fragment then fails: the network cut of CL-1. */
async function* cutStream(): AsyncGenerator<TutorReplyPart> {
  await Promise.resolve();
  yield { type: 'text-delta', id: 'tutor', delta: 'La date de pièce' };
  throw new StreamInterruptedError();
}

/** Stream that fails before any fragment: an error typed by the contract (EF-7). */
async function* failingStream(error: unknown): AsyncGenerator<TutorReplyPart> {
  await Promise.resolve();
  yield* emptyFragment();
  throw error;
}

function* emptyFragment(): Generator<TutorReplyPart> {
  // No fragment: the error happens before the first byte (EF-7).
}

/** Stream that yields one fragment, then waits for the abort signal (the « Arrêter » case). */
async function* gatedStream(signal: AbortSignal | undefined): AsyncGenerator<TutorReplyPart> {
  yield { type: 'text-delta', id: 'tutor', delta: 'La date de pièce' };
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 2_000);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new StreamInterruptedError());
    });
  });
  yield { type: 'text-delta', id: 'tutor', delta: ' suite.' };
}
