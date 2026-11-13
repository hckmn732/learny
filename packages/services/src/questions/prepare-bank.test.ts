import { describe, expect, it } from 'vitest';

import { validateBrick, brickFingerprint, type BrickReferenceResolver } from '@learny/bricks';
import { maskFingerprint, QuestionBankPrepareInput, QuestionBankResult } from '@learny/contracts';

const NOTION = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const FORMATION = '33333333-3333-4333-8333-333333333333';
const CHUNK = '44444444-4444-4444-8444-444444444444';

const resolver: BrickReferenceResolver = {
  existingNotionIds: () => Promise.resolve(new Set([NOTION, OTHER])),
  chunks: () => Promise.resolve(new Map([[CHUNK, { resourceId: CHUNK }]])),
  resources: () =>
    Promise.resolve(
      new Map([[CHUNK, { kind: 'note' as const, pages: null, durationSec: null, deleted: false }]]),
    ),
  existingBrickIds: () => Promise.resolve(new Set()),
};

function choice(stem: string, distractorNotion: string | null = OTHER) {
  return {
    stem,
    mode: 'single',
    options: [
      { id: 'a', text: 'La bonne réponse', correct: true, notionId: NOTION },
      { id: 'b', text: 'Une confusion', correct: false, notionId: distractorNotion },
      { id: 'c', text: 'Une autre confusion', correct: false, notionId: OTHER },
    ],
    explanation: 'Une explication suffisamment longue pour le schéma de la brique.',
    objective: 'Vérifier la notion',
    sources: [],
  };
}

function draft(payload: unknown) {
  return {
    type: 'choice_question',
    formationId: FORMATION,
    purpose: 'bank',
    notionIds: [NOTION],
    origin: 'tutor',
    payload,
  };
}

describe('[SPEC-513] Banques de questions', () => {
  it('CA-1 — quatre variantes valides ont quatre empreintes distinctes', async () => {
    const fingerprints = new Set<string>();
    let first = '';
    for (let index = 1; index <= 4; index += 1) {
      const validated = await validateBrick(draft(choice(`Question ${String(index)} ?`)), resolver);
      expect(validated.ok).toBe(true);
      if (!validated.ok) continue;
      expect(validated.value.fingerprint).toMatch(/^[0-9a-f]{64}$/);
      if (index === 1) first = validated.value.fingerprint ?? '';
      fingerprints.add(validated.value.fingerprint ?? '');
    }
    expect(fingerprints.size).toBe(4);
    const duplicate = await validateBrick(draft(choice('Question 1 ?')), resolver);
    expect(duplicate.ok).toBe(true);
    if (duplicate.ok) {
      expect(brickFingerprint('choice_question', duplicate.value.payload)).toBe(first);
    }
  });

  it('CA-2 — une brique invalide est refusée avant insertion', async () => {
    const invalid = await validateBrick(draft(choice('Question sans notion ?', null)), resolver);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.error.map((issue) => issue.code)).toContain('DISTRACTOR_NOTION_MISSING');
    }
  });

  it('CA-3 et contrat — les entrées et sorties restent validées par Zod', () => {
    const input = QuestionBankPrepareInput.safeParse({
      courseVersionId: FORMATION,
      notionId: NOTION,
      formats: ['choice_question'],
      count: 4,
      reason: 'exhaustion',
    });
    expect(input.success).toBe(true);
    const invalid = QuestionBankPrepareInput.safeParse({
      courseVersionId: FORMATION,
      notionId: NOTION,
      formats: ['text'],
      count: 2,
    });
    expect(invalid.success).toBe(false);

    const result = QuestionBankResult.parse({
      requestId: FORMATION,
      courseVersionId: FORMATION,
      reason: 'exhaustion',
      groups: [
        {
          notionId: NOTION,
          format: 'choice_question',
          required: 4,
          available: 4,
          inserted: 4,
          duplicates: 0,
          complete: true,
        },
      ],
      variants: [],
      complete: true,
    });
    expect(result.complete).toBe(true);
    expect(maskFingerprint('a'.repeat(64))).toBe('aaaaaa…aaaaaa');
    expect(maskFingerprint('a'.repeat(64))).not.toContain('a'.repeat(64));
  });
});
