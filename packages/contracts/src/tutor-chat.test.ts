import { describe, expect, it } from 'vitest';

import {
  ChatContextInput,
  ConversationDto,
  SendMessageInput,
  SelfTestAnswerInput,
  TutorMessageDto,
} from './tutor-chat';

const ID = '0b6f2a7e-9a3c-4c1c-8a55-3d1f6f1d2a01';
const AT = '2026-11-11T12:20:00.000Z';

describe('[SPEC-610] contrats de la discussion contextuelle', () => {
  it('accepte les six clés, un passage de 12 à 1 000 caractères et des clés partielles', () => {
    expect(
      ChatContextInput.safeParse({
        include: { formation: true, passage: false },
        passage: { text: 'douze caractères', sectionId: ID },
      }).success,
    ).toBe(true);
    expect(ChatContextInput.safeParse({ include: { inconnue: true } }).success).toBe(false);
    expect(ChatContextInput.safeParse({ include: {}, passage: { text: 'court' } }).success).toBe(
      false,
    );
    expect(
      ChatContextInput.safeParse({ include: {}, passage: { text: 'x'.repeat(1_001) } }).success,
    ).toBe(false);
  });

  it('valide un message de tuteur avec sources, suites et Teste-moi', () => {
    expect(
      TutorMessageDto.safeParse({
        id: ID,
        role: 'tutor',
        content: 'Une réponse sourcée.',
        sources: [{ label: 'Guide FI, p. 4' }],
        followUps: [
          { key: 'rephrase', label: 'Explique autrement' },
          { key: 'test_me', label: 'Teste-moi' },
        ],
        selfTest: { status: 'pending' },
        createdAt: AT,
      }).success,
    ).toBe(true);
    expect(
      TutorMessageDto.safeParse({
        id: ID,
        role: 'professor',
        content: 'x',
        sources: [],
        followUps: [],
        selfTest: null,
        createdAt: AT,
      }).success,
    ).toBe(false);
  });

  it('valide une discussion complète et une question bornée', () => {
    expect(
      ConversationDto.safeParse({
        id: ID,
        courseId: ID,
        chapterId: ID,
        title: null,
        createdAt: AT,
        messages: [],
        contextItems: [
          { key: 'formation', label: 'Formation', value: 'SAP S/4HANA Finance', included: true },
        ],
        pendingSelfTest: false,
      }).success,
    ).toBe(true);
    expect(
      SendMessageInput.safeParse({ text: '  ', context: { include: { chapter: true } } }).success,
    ).toBe(false);
    expect(
      SendMessageInput.safeParse({
        text: 'Explique autrement',
        context: { include: { chapter: true } },
        followUp: 'rephrase',
      }).success,
    ).toBe(true);
    expect(SelfTestAnswerInput.safeParse({ text: 'clé 31 au crédit' }).success).toBe(true);
  });
});
