// Unit tests of the conversation service (SPEC-610 ET-3, BR-TUT-07, ADR-0040): private reads under
// the caller's RLS client, the code-composed greeting, message mapping and the 404 of a foreign
// conversation. The transaction and the context builder are fakes; no row and no model call.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserDatabase } from '@learny/db';

import { silentLogger, TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import type { BuiltContext } from './context';
import {
  ALL_KEYS_INCLUDED,
  contextItemsOf,
  conversationByCourse,
  conversationById,
  conversationMessages,
  createConversation,
  getConversationRef,
  greetingOf,
  greetingText,
  lastContextOf,
  listConversations,
  messageDto,
} from './conversations';

const mocks = vi.hoisted(() => ({
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: strings.join('?'),
    values,
  })),
  buildContext: vi.fn(),
}));

vi.mock('@learny/db', () => ({ sql: mocks.sql }));
vi.mock('./context', () => ({ buildContext: mocks.buildContext }));

const USER = '11111111-1111-4111-8111-111111111111';
const COURSE = '22222222-2222-4222-8222-222222222222';
const CHAPTER = '33333333-3333-4333-8333-333333333333';
const CONV = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-11-11T12:20:00Z');

const clock = new TestClock(NOW.toISOString());

function built(overrides: Partial<BuiltContext> = {}): BuiltContext {
  return {
    items: [
      { key: 'formation', label: 'Formation', value: 'SAP', included: true },
      { key: 'chapter', label: 'Cours en lecture', value: 'Chapitre 2', included: true },
    ],
    includedKeys: ['formation', 'chapter', 'resources', 'gap', 'profile'],
    promptBlock: '<context />',
    resourcesBlock: '',
    sources: [],
    gapFirst: false,
    notionIds: [],
    profile: { tone: 'vous', courseLanguage: 'fr' },
    formationId: 'f',
    chapterId: CHAPTER,
    chapterTitle: 'Saisie',
    chapterPosition: 2,
    courseId: COURSE,
    primaryResourceTitle: null,
    promptVersion: 1,
    passageLabel: null,
    passagePreview: null,
    resourceTitles: [],
    notionLabels: {},
    gapNotionId: null,
    gapLabel: null,
    gapNatureText: null,
    confusion: null,
    ...overrides,
  };
}

function context(execute: ReturnType<typeof vi.fn>): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-conversations',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as UserDatabase,
    clock,
    logger: silentLogger(),
  };
}

type Handler = (text: string) => unknown;

function database(handler: Handler) {
  return vi.fn((query: { text: string }) => handler(query.text));
}

beforeEach(() => {
  mocks.buildContext.mockReset().mockResolvedValue(built());
  mocks.sql.mockClear();
});

describe('[SPEC-610] discussions du tuteur', () => {
  it('mappe un message complet, ses sources, suites et Teste-moi', () => {
    const dto = messageDto({
      id: CONV,
      role: 'tutor',
      content: 'Bonjour',
      sources: [{ label: 'Guide FI, p. 4' }, { label: 42 }, null],
      follow_ups: ['rephrase', 'inconnu', 'compare'],
      self_test: { status: 'answered', correct: true, masteryBefore: 35, masteryAfter: 52 },
      context: { followUpLabels: { rephrase: 'Dit autrement', compare: 'La différence' } },
      created_at: NOW,
    });
    expect(dto).toEqual({
      id: CONV,
      role: 'tutor',
      content: 'Bonjour',
      sources: [{ label: 'Guide FI, p. 4' }],
      followUps: [
        { key: 'rephrase', label: 'Dit autrement' },
        { key: 'compare', label: 'La différence' },
      ],
      selfTest: { status: 'answered', correct: true, masteryBefore: 35, masteryAfter: 52 },
      createdAt: NOW.toISOString(),
    });
  });

  it('tolère les colonnes texte de PostgreSQL et les valeurs invalides', () => {
    const dto = messageDto({
      id: CONV,
      role: 'learner',
      content: 'Question',
      sources: 'pas un tableau',
      follow_ups: '{rephrase,"compare"}',
      self_test: '{"status":"pending"}',
      context: '{"followUpLabels":{"test_me":"Teste-moi"}}',
      created_at: NOW.toISOString(),
    });
    expect(dto.sources).toEqual([]);
    expect(dto.followUps).toEqual([
      { key: 'rephrase', label: 'rephrase' },
      { key: 'compare', label: 'compare' },
    ]);
    expect(dto.selfTest).toEqual({ status: 'pending' });
    expect(dto.createdAt).toBe(NOW.toISOString());

    expect(
      messageDto({
        id: CONV,
        role: 'tutor',
        content: 'x',
        sources: [{ label: 'ok' }],
        follow_ups: '{}',
        self_test: '{"status":"inconnu"}',
        context: 'pas du json',
        created_at: NOW,
      }).selfTest,
    ).toBeNull();
  });

  it('compose le salut selon le passage, les apports et la lacune', () => {
    expect(
      greetingText(
        built({
          passageLabel: 'Les postes',
          resourceTitles: ['Guide FI (PDF)', 'Note vocale'],
          gapLabel: 'Clé de comptabilisation',
          gapNatureText: 'confondue avec Type de pièce',
        }),
      ),
    ).toBe(
      'Vous lisez « Les postes ». Je pars de ce passage, de vos 2 apports et du reste du chapitre. Vos quiz montrent que clé de comptabilisation confondue avec Type de pièce : j’y ferai attention. Que voulez-vous que je vous explique ?',
    );
    expect(greetingText(built({ passageLabel: 'Les postes' }))).toBe(
      'Vous lisez « Les postes ». Je pars de ce passage et du reste du chapitre. Que voulez-vous que je vous explique ?',
    );
    expect(greetingText(built({ resourceTitles: ['Guide FI (PDF)'] }))).toBe(
      'Je connais ce chapitre, vos 1 apports (guide fi) et votre objectif. Que voulez-vous que je vous explique ?',
    );
    expect(greetingText(built({ includedKeys: ['formation'] }))).toBe(
      'Je connais ce chapitre et votre objectif. Que voulez-vous que je vous explique ?',
    );
    expect(
      greetingOf(
        built({ confusion: { left: 'Clé de comptabilisation', right: 'Type de pièce' } }),
      ).followUps.map((entry) => entry.key),
    ).toEqual(['rephrase', 'example', 'compare', 'test_me']);
  });

  it('crée une discussion, écrit le salut et la relit', async () => {
    const execute = database((text) => {
      if (text.includes('insert into public.tutor_conversations')) return [{ id: CONV }];
      if (text.includes('insert into public.tutor_messages')) return [];
      if (text.includes('order by ch.position'))
        return [{ id: CONV, course_id: COURSE, chapter_id: CHAPTER }];
      if (text.includes('role::text as role')) return [];
      if (text.includes('title, created_at'))
        return [{ id: CONV, course_id: COURSE, title: null, created_at: NOW }];
      return [];
    });
    const result = await createConversation(context(execute), COURSE, CHAPTER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      id: CONV,
      courseId: COURSE,
      chapterId: CHAPTER,
      title: null,
      messages: [],
      contextItems: built().items,
      pendingSelfTest: false,
    });
    expect(mocks.buildContext).toHaveBeenCalledTimes(2);
    const inserts = execute.mock.calls.map(([query]) => query.text);
    expect(inserts.some((text) => text.includes('insert into public.tutor_messages'))).toBe(true);
  });

  it('rend 404 un cours absent et refuse un appelant anonyme', async () => {
    const missing = await createConversation(context(database(() => [])), COURSE, CHAPTER);
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const anonymous: ServiceContext = {
      userId: null,
      requestId: 'req-anon',
      db: null,
      clock,
      logger: silentLogger(),
    };
    await expect(createConversation(anonymous, COURSE, CHAPTER)).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    await expect(listConversations(anonymous, COURSE)).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
  });

  it('liste les discussions par dernière activité', async () => {
    const execute = database((text) => {
      if (text.includes('coalesce(max(m.created_at)'))
        return [
          { id: CONV, title: 'Les postes', created_at: NOW, last_message_at: NOW.toISOString() },
        ];
      return [];
    });
    const result = await listConversations(context(execute), COURSE);
    expect(result).toEqual({
      ok: true,
      value: {
        items: [
          {
            id: CONV,
            title: 'Les postes',
            createdAt: NOW.toISOString(),
            lastMessageAt: NOW.toISOString(),
          },
        ],
      },
    });
  });

  it('relit les messages et déduit le dernier contexte apprenant', async () => {
    const rows = [
      {
        id: 'm1',
        role: 'learner' as const,
        content: 'Question',
        sources: [],
        follow_ups: [],
        self_test: null,
        context: { include: { gap: false }, passage: { text: 'Un passage suffisant.' } },
        created_at: NOW,
      },
      {
        id: 'm2',
        role: 'tutor' as const,
        content: 'Réponse',
        sources: [],
        follow_ups: [],
        self_test: { status: 'pending' },
        context: { include: { formation: false } },
        created_at: NOW,
      },
    ];
    const execute = database((text) => {
      if (text.includes('role::text as role')) return rows;
      if (text.includes('order by ch.position'))
        return [{ id: CONV, course_id: COURSE, chapter_id: CHAPTER }];
      if (text.includes('title, created_at'))
        return [{ id: CONV, course_id: COURSE, title: 'Les postes', created_at: NOW }];
      return [];
    });
    const ctx = context(execute);
    await expect(conversationMessages(ctx, CONV)).resolves.toBe(rows);
    expect(lastContextOf(rows)).toEqual({
      include: { gap: false },
      passage: { text: 'Un passage suffisant.' },
    });
    const dto = await conversationById(ctx, CONV);
    expect(dto.pendingSelfTest).toBe(true);
    expect(dto.messages).toHaveLength(2);
    expect(dto.chapterId).toBe(CHAPTER);
    expect(contextItemsOf(built())).toEqual(built().items);
  });

  it('retombe sur toutes les clés sans contexte apprenant valide', () => {
    expect(lastContextOf([])).toEqual(ALL_KEYS_INCLUDED);
    expect(
      lastContextOf([
        {
          id: 'm',
          role: 'learner',
          content: 'x',
          sources: [],
          follow_ups: [],
          self_test: null,
          context: 'pas du json',
          created_at: NOW,
        },
      ]),
    ).toEqual(ALL_KEYS_INCLUDED);
  });

  it('retrouve une discussion par identifiant ou par cours', async () => {
    const execute = database((text) => {
      if (text.includes('order by ch.position'))
        return [{ id: CONV, course_id: COURSE, chapter_id: CHAPTER }];
      if (text.includes('order by conv.updated_at desc'))
        return [{ id: CONV, course_id: COURSE, chapter_id: CHAPTER }];
      return [];
    });
    const ctx = context(execute);
    await expect(getConversationRef(ctx, CONV)).resolves.toEqual({
      id: CONV,
      courseId: COURSE,
      chapterId: CHAPTER,
    });
    await expect(conversationByCourse(ctx, COURSE, CHAPTER)).resolves.toEqual({
      id: CONV,
      courseId: COURSE,
      chapterId: CHAPTER,
    });

    const empty = context(database(() => []));
    await expect(getConversationRef(empty, CONV)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(conversationByCourse(empty, COURSE, CHAPTER)).resolves.toBeNull();
  });
});
