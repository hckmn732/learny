import { describe, expect, it } from 'vitest';

import type { AutomationActionView } from '../moteur-d-automatismes';

import {
  explainQuestionsCartes,
  questionCardDedupeKey,
  questionCardSkipReason,
} from './questions-cartes';

const NOW = '2026-11-11T12:20:00.000Z';
const CONVERSATION = '11111111-1111-4111-8111-111111111111';
const NOTION = '22222222-2222-4222-8222-222222222222';

function action(
  overrides: Partial<AutomationActionView> = {},
  payload: Record<string, unknown> = {},
): AutomationActionView {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    automation: 'questions_cartes',
    kind: 'card_created',
    summary: '',
    formationId: '44444444-4444-4444-8444-444444444444',
    payload: {
      dedupeKey: questionCardDedupeKey(CONVERSATION, NOTION),
      notionId: NOTION,
      notionLabel: 'Clé de comptabilisation',
      mode: 'confirm',
      brickId: null,
      ...payload,
    },
    undoPayload: null,
    requiresConsent: true,
    status: 'pending_consent',
    decidedAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

describe('[SPEC-717] règles et calculs — question devenue carte', () => {
  it('CA-1 — en mode confirmation, une question produit une action en attente', () => {
    const text = explainQuestionsCartes(action());
    expect(text).toBe(
      'Une question sur « Clé de comptabilisation » peut devenir une carte de rappel : acceptez pour l’ajouter au quiz global.',
    );
    expect(text.length).toBeLessThanOrEqual(160);
    expect(text).not.toContain('\n');
  });

  it('CA-1 — l’acceptation crée une carte appliquée et le journal le dit', () => {
    const text = explainQuestionsCartes(
      action(
        { status: 'applied', decidedAt: NOW },
        { brickId: '55555555-5555-4555-8555-555555555555' },
      ),
    );
    expect(text).toBe('Carte de rappel « Clé de comptabilisation » ajoutée au quiz global.');
  });

  it('CA-2, EF-2 — le refus et l’annulation restent lisibles dans le journal', () => {
    expect(explainQuestionsCartes(action({ status: 'declined' }))).toBe(
      'Refusé : la question sur « Clé de comptabilisation » ne devient pas une carte.',
    );
    expect(explainQuestionsCartes(action({ status: 'undone' }))).toBe(
      'Annulé : carte de rappel « Clé de comptabilisation » retirée des prochains tirages.',
    );
  });

  it('ET-4 — la clé de déduplication porte la conversation et la notion', () => {
    expect(questionCardDedupeKey(CONVERSATION, NOTION)).toBe(
      `question_card:${CONVERSATION}:${NOTION}`,
    );
    expect(questionCardDedupeKey(CONVERSATION, NOTION)).toBe(
      questionCardDedupeKey(CONVERSATION, NOTION),
    );
  });

  it('CL-3 — une réponse absente, une notion absente ou un contenu signalé ne crée rien', () => {
    const source = {
      question: 'Pourquoi la clé est-elle portée par le poste ?',
      answer: 'Parce que la clé dépend du compte général mouvementé.',
      notionId: NOTION,
      notionExists: true,
      reported: false,
    };
    expect(questionCardSkipReason(source)).toBeNull();
    expect(questionCardSkipReason({ ...source, answer: '   ' })).toBe('missing_answer');
    expect(questionCardSkipReason({ ...source, question: '' })).toBe('missing_question');
    expect(questionCardSkipReason({ ...source, notionId: '' })).toBe('missing_notion');
    expect(questionCardSkipReason({ ...source, notionExists: false })).toBe('unknown_notion');
    expect(questionCardSkipReason({ ...source, reported: true })).toBe('reported_source');
  });
});
