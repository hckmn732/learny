import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { EngineError } from '../errors';
import { buildAnswer, buildGap } from '../fixtures/builders';
import { formatInstant, parseInstant } from '../time';
import type { AnswerRecord, AttemptKind, GapNature, GapState } from '../types';

import {
  DEFAULT_GAP_PARAMS,
  RECOMMENDED_ACTION_BY_NATURE,
  clearGap,
  detectGap,
  gapErrorKey,
  isGapFailure,
  isGapSuccess,
  normalizeError,
} from './index';
import type { ClearGapInput, DetectGapInput, GapAttempt, GapParams } from './index';

const NOW = '2026-11-11T12:20:00.000Z';
const NOTION = 'n-s4';
const OTHER = 'n-type';
const PARAMS: GapParams = {
  masteryThreshold: 80,
  failureRatio: 0.5,
  forgettingMinDays: 7,
  repeatedErrorAttempts: 2,
  clearSuccesses: 2,
  clearMinDaysApart: 1,
};
const FAST_CHECK = { seed: 20261111, numRuns: 100 } as const;

let sequence = 0;

function answer(partial: Partial<AnswerRecord> = {}): AnswerRecord {
  sequence += 1;
  return buildAnswer({
    answerId: `answer-${String(sequence)}`,
    attemptId: `attempt-${String(sequence)}`,
    notionIds: [NOTION],
    countsForGaps: true,
    ...partial,
  });
}

function attempt(
  attemptId: string,
  attemptKind: AttemptKind,
  answers: readonly AnswerRecord[],
): GapAttempt {
  return {
    attemptId,
    attemptKind,
    answers: answers.map((item) => ({
      ...item,
      attemptId,
      attemptKind,
    })),
  };
}

function input(overrides: Partial<DetectGapInput> = {}): DetectGapInput {
  return {
    notion: NOTION,
    attempts: [],
    mastery: 60,
    now: NOW,
    params: PARAMS,
    ...overrides,
  };
}

function clearInput(overrides: Partial<ClearGapInput> = {}): ClearGapInput {
  const gap: GapState = buildGap({
    nature: 'forgetting',
    confusedWith: null,
    detectedAt: '2026-11-01T10:00:00.000Z',
    evidence: 'Détection de test.',
  });
  return {
    gap,
    successes: [],
    mastery: 90,
    now: NOW,
    notion: NOTION,
    params: PARAMS,
    ...overrides,
  };
}

function engineError(run: () => unknown, path?: string): EngineError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(EngineError);
    const engine = error as EngineError;
    expect(engine.code).toBe('INVALID_INPUT');
    if (path !== undefined) expect(engine.details?.path).toBe(path);
    return engine;
  }
  throw new Error('aucune EngineError levée');
}

function failedChoice(confusedWith: string | null = null, correct = false): AnswerRecord {
  return answer({
    correct,
    format: 'choice_question',
    chosenDistractorNotionId: confusedWith,
    normalizedResponse: null,
  });
}

function failedOpen(response: string, offTopic = false): AnswerRecord {
  return answer({
    correct: false,
    format: 'open_question',
    normalizedResponse: response,
    offTopic,
  });
}

function successfulChoice(answeredAt = '2026-11-01T09:00:00.000Z'): AnswerRecord {
  return answer({
    correct: true,
    format: 'choice_question',
    answeredAt,
    chosenDistractorNotionId: null,
    normalizedResponse: null,
  });
}

function atMs(ms: number): string {
  return formatInstant(ms);
}

const DETECTION_CASES: readonly {
  name: string;
  attempts: readonly GapAttempt[];
  mastery: number;
  nature: GapNature;
  confusedWith: string | null;
}[] = [
  {
    name: 'oubli',
    mastery: 55,
    nature: 'forgetting',
    confusedWith: null,
    attempts: [
      attempt('a-valid', 'validation_quiz', [successfulChoice('2026-10-01T09:00:00.000Z')]),
      attempt('a-fail', 'validation_quiz', [
        answer({
          correct: false,
          format: 'choice_question',
          answeredAt: '2026-10-09T09:00:00.000Z',
        }),
      ]),
    ],
  },
  {
    name: 'confusion',
    mastery: 40,
    nature: 'confusion',
    confusedWith: OTHER,
    attempts: [attempt('a-valid', 'validation_quiz', [failedChoice(OTHER, false)])],
  },
  {
    name: 'incompréhension',
    mastery: 30,
    nature: 'misunderstanding',
    confusedWith: null,
    attempts: [
      attempt('a-valid', 'validation_quiz', [
        failedOpen('Je ne sais pas', true),
        failedChoice(null, false),
      ]),
    ],
  },
  {
    name: 'application',
    mastery: 50,
    nature: 'application',
    confusedWith: null,
    attempts: [
      attempt('a-valid', 'validation_quiz', [successfulChoice('2026-11-08T09:00:00.000Z')]),
      attempt('a-exercise', 'exercise', [failedChoice(null, false)]),
    ],
  },
];

describe('[SPEC-404] Détection, nature et levée des lacunes', () => {
  describe('EF-2 — normalisation des erreurs ouvertes', () => {
    it('ignore casse, accents et espaces superflus', () => {
      expect(normalizeError('  ÉCONOMIE   d’échelle ')).toBe('economie d’echelle');
      expect(normalizeError('ÉCONOMIE   d’échelle')).toBe('economie d’echelle');
      expect(normalizeError('theoreme\tde\npythagore')).toBe('theoreme de pythagore');
      expect(normalizeError('  ')).toBe('');
      expect(normalizeError('ÉÉÉ')).toBe('eee');
    });

    it('est idempotente et refuse une valeur non textuelle', () => {
      const once = normalizeError('  Réseau  ');
      expect(normalizeError(once)).toBe(once);
      expect(normalizeError('RÉSEAU')).toBe('reseau');
      expect(() => normalizeError(42 as unknown as string)).toThrow(EngineError);
    });

    it('identifie un choix par son distracteur et une ouverte par sa réponse normalisée', () => {
      expect(gapErrorKey(answer({ correct: false, chosenDistractorNotionId: OTHER }))).toBe(
        `distractor:${OTHER}`,
      );
      expect(
        gapErrorKey(
          answer({
            correct: false,
            format: 'open_question',
            normalizedResponse: 'Théorème  de Pythagore',
          }),
        ),
      ).toBe('response:theoreme de pythagore');
      expect(
        gapErrorKey(
          answer({
            correct: false,
            format: 'matching',
            confusedWithNotionId: OTHER,
          }),
        ),
      ).toBe(`confusion:${OTHER}`);
      expect(
        gapErrorKey(answer({ correct: false, format: 'choice_question', normalizedResponse: 'x' })),
      ).toBeNull();
    });
  });

  describe('EF-1, CA-1 — détection après une tentative qualifiante', () => {
    it('détecte une lacune sous 80 % après une tentative de validation', () => {
      const result = detectGap(
        input({
          mastery: 79.99,
          attempts: [attempt('a-valid', 'validation_quiz', [failedChoice()])],
        }),
      );
      expect(result.active).toBe(true);
      expect(result.event).toBe('detected');
      expect(result.triggers).toEqual(['qualifying_attempt']);
      expect(result.nature).toBe('misunderstanding');
      expect(result.gap).toMatchObject({
        nature: 'misunderstanding',
        confusedWith: null,
        detectedAt: NOW,
        clearedAt: null,
      });
    });

    it('ne détecte rien sans tentative, même avec une maîtrise basse (CL-1)', () => {
      const result = detectGap(input({ mastery: 10, attempts: [] }));
      expect(result).toMatchObject({
        active: false,
        nature: null,
        confusedWith: null,
        event: null,
        gap: null,
        triggers: [],
        recommendedAction: null,
      });
      expect(result.evidence).toContain('Aucune tentative');
    });

    it('ne détecte rien à 80 % exactement ni après une réussite qualifiante', () => {
      const atThreshold = detectGap(
        input({
          mastery: 80,
          attempts: [attempt('a-valid', 'validation_quiz', [failedChoice()])],
        }),
      );
      expect(atThreshold.active).toBe(false);

      const afterSuccess = detectGap(
        input({
          mastery: 70,
          attempts: [attempt('a-valid', 'validation_quiz', [successfulChoice(NOW)])],
        }),
      );
      expect(afterSuccess.active).toBe(false);
    });

    it('ignore une tentative non qualifiante (échauffement) et une notion étrangère', () => {
      const warmup = detectGap(
        input({
          mastery: 40,
          attempts: [attempt('a-warm', 'warmup', [failedChoice()])],
        }),
      );
      expect(warmup.active).toBe(false);

      const otherNotion = detectGap(
        input({
          mastery: 40,
          attempts: [
            attempt('a-valid', 'validation_quiz', [
              answer({ notionIds: ['n-other'], correct: false }),
            ]),
          ],
        }),
      );
      expect(otherNotion.active).toBe(false);
    });

    it('ignore les réponses qui ne comptent pas pour les lacunes', () => {
      const result = detectGap(
        input({
          mastery: 40,
          attempts: [
            attempt('a-valid', 'validation_quiz', [
              answer({ correct: false, countsForGaps: false }),
            ]),
          ],
        }),
      );
      expect(result.active).toBe(false);
    });

    it('ne détecte pas par la seule maîtrise sous le seuil', () => {
      const result = detectGap(
        input({
          mastery: 20,
          attempts: [attempt('a-warm', 'warmup', [successfulChoice(NOW)])],
        }),
      );
      expect(result.active).toBe(false);
    });
  });

  describe('EF-2, CA-2 — même erreur sur deux tentatives', () => {
    it('détecte une réponse ouverte normalisée répétée sur deux tentatives', () => {
      const result = detectGap(
        input({
          mastery: 90,
          attempts: [
            attempt('a-1', 'global_quiz_session', [failedOpen('Théorème de Pythagore')]),
            attempt('a-2', 'global_quiz_session', [failedOpen('  THEOREME   de pythagore ')]),
          ],
        }),
      );
      expect(result.active).toBe(true);
      expect(result.event).toBe('detected');
      expect(result.triggers).toEqual(['repeated_error']);
      expect(result.repeatedErrors).toEqual([
        { key: 'response:theoreme de pythagore', attemptIds: ['a-1', 'a-2'] },
      ]);
    });

    it('ne déclenche pas deux erreurs identiques dans une seule tentative (CL-3)', () => {
      const result = detectGap(
        input({
          mastery: 90,
          attempts: [
            attempt('a-1', 'global_quiz_session', [
              failedOpen('Théorème de Pythagore'),
              failedOpen('theoreme de pythagore'),
            ]),
          ],
        }),
      );
      expect(result.active).toBe(false);
      expect(result.repeatedErrors).toEqual([]);
    });

    it('détecte le même distracteur choisi dans deux tentatives', () => {
      const result = detectGap(
        input({
          mastery: 90,
          attempts: [
            attempt('a-1', 'global_quiz_session', [failedChoice(OTHER)]),
            attempt('a-2', 'global_quiz_session', [failedChoice(OTHER)]),
          ],
        }),
      );
      expect(result.active).toBe(true);
      expect(result.nature).toBe('confusion');
      expect(result.confusedWith).toBe(OTHER);
      expect(result.repeatedErrors[0]?.key).toBe(`distractor:${OTHER}`);
    });

    it('ne répète pas deux erreurs différentes sur deux tentatives', () => {
      const result = detectGap(
        input({
          mastery: 90,
          attempts: [
            attempt('a-1', 'global_quiz_session', [failedChoice('n-a')]),
            attempt('a-2', 'global_quiz_session', [failedChoice('n-b')]),
          ],
        }),
      );
      expect(result.active).toBe(false);
      expect(result.repeatedErrors).toEqual([]);
    });

    it('exige le nombre configuré de tentatives distinctes', () => {
      const attempts = [
        attempt('a-1', 'global_quiz_session', [failedChoice(OTHER)]),
        attempt('a-2', 'global_quiz_session', [failedChoice(OTHER)]),
      ];
      expect(
        detectGap(input({ mastery: 90, attempts, params: { ...PARAMS, repeatedErrorAttempts: 3 } }))
          .active,
      ).toBe(false);
      expect(
        detectGap(
          input({
            mastery: 90,
            attempts: [...attempts, attempt('a-3', 'global_quiz_session', [failedChoice(OTHER)])],
            params: { ...PARAMS, repeatedErrorAttempts: 3 },
          }),
        ).active,
      ).toBe(true);
    });
  });

  describe('EF-3, EF-4, CA-3 — natures, priorité et remédiation', () => {
    it.each(DETECTION_CASES)('classe $name et renvoie son action', (testCase) => {
      const result = detectGap(
        input({
          mastery: testCase.mastery,
          attempts: testCase.attempts,
        }),
      );
      expect(result.active).toBe(true);
      expect(result.nature).toBe(testCase.nature);
      expect(result.confusedWith).toBe(testCase.confusedWith);
      expect(result.recommendedAction).toBe(RECOMMENDED_ACTION_BY_NATURE[testCase.nature]);
    });

    it('applique la priorité confusion > application > incompréhension > oubli', () => {
      const allSignals = detectGap(
        input({
          mastery: 30,
          attempts: [
            attempt('a-old', 'validation_quiz', [successfulChoice('2026-09-01T09:00:00.000Z')]),
            attempt('a-mid', 'validation_quiz', [
              successfulChoice('2026-11-08T09:00:00.000Z'),
              failedOpen('Hors sujet', true),
              failedOpen('Encore hors sujet', true),
            ]),
            attempt('a-exercise', 'exercise', [failedChoice(OTHER)]),
          ],
        }),
      );
      expect(allSignals.nature).toBe('confusion');
      expect(allSignals.confusedWith).toBe(OTHER);

      const application = detectGap(
        input({
          mastery: 30,
          attempts: [
            attempt('a-mid', 'validation_quiz', [
              successfulChoice('2026-11-08T09:00:00.000Z'),
              failedOpen('Hors sujet', true),
            ]),
            attempt('a-exercise', 'exercise', [failedChoice(null)]),
          ],
        }),
      );
      expect(application.nature).toBe('application');

      const misunderstanding = detectGap(
        input({
          mastery: 30,
          attempts: [
            attempt('a-old', 'validation_quiz', [successfulChoice('2026-09-01T09:00:00.000Z')]),
            attempt('a-recent', 'validation_quiz', [
              failedOpen('Hors sujet', true),
              failedChoice(null),
            ]),
          ],
        }),
      );
      expect(misunderstanding.nature).toBe('misunderstanding');
    });

    it('signale un oubli quand la réussite précède l’échec de sept jours ou plus', () => {
      const exactlySeven = detectGap(
        input({
          mastery: 50,
          attempts: [
            attempt('a-old', 'validation_quiz', [successfulChoice('2026-10-01T09:00:00.000Z')]),
            attempt('a-recent', 'validation_quiz', [
              answer({
                correct: false,
                format: 'choice_question',
                answeredAt: '2026-10-08T09:00:00.000Z',
              }),
            ]),
          ],
        }),
      );
      expect(exactlySeven.nature).toBe('forgetting');
      expect(exactlySeven.evidence).toContain('réussie le 2026-10-01');
    });

    it('signale un oubli sur un lapse FSRS fourni par le service', () => {
      const result = detectGap(
        input({
          mastery: 50,
          fsrsLapsed: true,
          attempts: [attempt('a-recent', 'validation_quiz', [failedChoice()])],
        }),
      );
      expect(result.nature).toBe('forgetting');
      expect(result.evidence).toContain('Lapse FSRS');
    });

    it('ne classe pas un échec récent comme un oubli', () => {
      const result = detectGap(
        input({
          mastery: 50,
          attempts: [
            attempt('a-old', 'validation_quiz', [successfulChoice('2026-11-01T09:00:00.000Z')]),
            attempt('a-recent', 'validation_quiz', [
              answer({
                correct: false,
                format: 'choice_question',
                answeredAt: '2026-11-07T09:00:00.000Z',
              }),
            ]),
          ],
        }),
      );
      expect(result.nature).toBe('misunderstanding');
    });
  });

  describe('CL-5 — changement de nature sans seconde lacune', () => {
    const existing = (): GapState =>
      buildGap({
        nature: 'misunderstanding',
        confusedWith: null,
        detectedAt: '2026-11-01T10:00:00.000Z',
        evidence: 'Ancienne preuve.',
      });

    it('émet nature_changed quand une nature plus prioritaire apparaît', () => {
      const result = detectGap(
        input({
          mastery: 40,
          existingGap: existing(),
          attempts: [attempt('a-valid', 'validation_quiz', [failedChoice(OTHER)])],
        }),
      );
      expect(result.active).toBe(true);
      expect(result.event).toBe('nature_changed');
      expect(result.nature).toBe('confusion');
      expect(result.confusedWith).toBe(OTHER);
      expect(result.gap?.detectedAt).toBe('2026-11-01T10:00:00.000Z');
    });

    it('conserve la nature active sans émettre d’événement', () => {
      const gap = buildGap({
        nature: 'confusion',
        confusedWith: OTHER,
        detectedAt: '2026-11-01T10:00:00.000Z',
        evidence: 'Confusion déjà détectée.',
      });
      const result = detectGap(
        input({
          mastery: 30,
          existingGap: gap,
          attempts: [
            attempt('a-valid', 'validation_quiz', [successfulChoice('2026-11-08T09:00:00.000Z')]),
            attempt('a-exercise', 'exercise', [failedChoice(null)]),
          ],
        }),
      );
      expect(result).toMatchObject({
        active: true,
        nature: 'confusion',
        confusedWith: OTHER,
        event: null,
        gap,
      });
    });

    it('ne recrée pas deux lacunes et garde l’état existant sans signal', () => {
      const gap = buildGap({
        nature: 'forgetting',
        confusedWith: null,
        detectedAt: '2026-11-01T10:00:00.000Z',
        evidence: 'Oubli déjà détecté.',
      });
      const result = detectGap(input({ mastery: 95, existingGap: gap, attempts: [] }));
      expect(result).toMatchObject({ active: true, nature: 'forgetting', event: null, gap });
    });
  });

  describe('ET-2, EF-5, CA-4 — levée de la lacune', () => {
    function success(answeredAt: string, partial: Partial<AnswerRecord> = {}): AnswerRecord {
      return answer({
        correct: true,
        answeredAt,
        chosenDistractorNotionId: null,
        normalizedResponse: null,
        ...partial,
      });
    }

    it('lève avec deux réussites à 24 h et 80 % de maîtrise', () => {
      const result = clearGap(
        clearInput({
          successes: [success('2026-11-10T12:20:00.000Z'), success('2026-11-11T12:20:00.000Z')],
          mastery: 80,
        }),
      );
      expect(result.cleared).toBe(true);
      expect(result.event).toBe('cleared');
      expect(result.clearedAt).toBe(NOW);
      expect(result.gap?.clearedAt).toBe(NOW);
      expect(result.checks).toEqual({
        activeGap: true,
        enoughSuccesses: true,
        spaced: true,
        masteryReached: true,
      });
      expect(result.evidence).toContain('Lacune levée');
    });

    it('maintient la lacune à 23 h 59 (CL-4)', () => {
      const result = clearGap(
        clearInput({
          successes: [success('2026-11-10T12:21:00.000Z'), success('2026-11-11T12:20:00.000Z')],
        }),
      );
      expect(result.cleared).toBe(false);
      expect(result.event).toBeNull();
      expect(result.checks.spaced).toBe(false);
      expect(result.gap?.clearedAt).toBeNull();
      expect(result.evidence).toContain('23,98 h');
    });

    it('maintient la lacune à 79,99 % de maîtrise', () => {
      const result = clearGap(
        clearInput({
          successes: [success('2026-11-10T12:20:00.000Z'), success('2026-11-11T12:20:00.000Z')],
          mastery: 79.99,
        }),
      );
      expect(result.cleared).toBe(false);
      expect(result.checks.masteryReached).toBe(false);
      expect(result.evidence).toContain('79,99');
    });

    it('exige deux réussites et ignore celles d’une autre notion', () => {
      const one = clearGap(clearInput({ successes: [success('2026-11-10T12:20:00.000Z')] }));
      expect(one.cleared).toBe(false);
      expect(one.checks.enoughSuccesses).toBe(false);

      const otherNotion = clearGap(
        clearInput({
          successes: [
            success('2026-11-10T12:20:00.000Z', { notionIds: ['n-other'] }),
            success('2026-11-11T12:20:00.000Z', { notionIds: ['n-other'] }),
          ],
        }),
      );
      expect(otherNotion.cleared).toBe(false);
      expect(otherNotion.successCount).toBe(0);
    });

    it('compte les réussites d’échauffement ou de quiz sans filtre de source', () => {
      const result = clearGap(
        clearInput({
          successes: [
            success('2026-11-10T12:20:00.000Z', {
              attemptKind: 'warmup',
              source: 'warmup',
              countsForGaps: false,
            }),
            success('2026-11-11T12:20:00.000Z', {
              attemptKind: 'global_quiz_session',
              source: 'global_quiz',
            }),
          ],
        }),
      );
      expect(result.cleared).toBe(true);
    });

    it('ignore les réussites antérieures à la détection et accepte un score partiel', () => {
      const before = clearGap(
        clearInput({
          successes: [success('2026-10-20T12:20:00.000Z'), success('2026-11-11T12:20:00.000Z')],
        }),
      );
      expect(before.cleared).toBe(false);
      expect(before.successCount).toBe(1);

      const partial = clearGap(
        clearInput({
          successes: [
            success('2026-11-10T12:20:00.000Z', { correct: null, score: 1, maxScore: 2 }),
            success('2026-11-11T12:20:00.000Z', { correct: null, score: 8, maxScore: 10 }),
          ],
        }),
      );
      expect(partial.cleared).toBe(true);
    });

    it('ne lève pas une lacune déjà levée ou absente', () => {
      const cleared: GapState = buildGap({
        nature: 'forgetting',
        confusedWith: null,
        detectedAt: '2026-11-01T10:00:00.000Z',
        clearedAt: '2026-11-05T10:00:00.000Z',
      });
      const result = clearGap(
        clearInput({
          gap: cleared,
          successes: [success('2026-11-10T12:20:00.000Z'), success('2026-11-11T12:20:00.000Z')],
        }),
      );
      expect(result.cleared).toBe(false);
      expect(result.checks.activeGap).toBe(false);
      expect(result.gap).toEqual(cleared);
      expect(result.evidence).toContain('Aucune lacune active');
    });

    it('refuse une réussite future', () => {
      engineError(
        () =>
          clearGap(
            clearInput({
              successes: [success('2026-11-11T12:20:00.001Z')],
            }),
          ),
        'successes.0.answeredAt',
      );
    });
  });

  describe('ET-3, ET-4 — événements, déterminisme et entrées invalides', () => {
    it('renvoie null, detected et nature_changed selon l’état', () => {
      const inactive = detectGap(input({ mastery: 90, attempts: [] }));
      expect(inactive.event).toBeNull();

      const detected = detectGap(
        input({ attempts: [attempt('a-valid', 'validation_quiz', [failedChoice()])] }),
      );
      expect(detected.event).toBe('detected');

      const changed = detectGap(
        input({
          attempts: [attempt('a-valid', 'validation_quiz', [failedChoice(OTHER)])],
          existingGap: buildGap({
            nature: 'misunderstanding',
            confusedWith: null,
            detectedAt: '2026-11-01T10:00:00.000Z',
            evidence: 'Ancienne preuve.',
          }),
        }),
      );
      expect(changed.event).toBe('nature_changed');
    });

    it('produit le même résultat à la répétition et à l’ordre des collections près', () => {
      const first = attempt('a-1', 'validation_quiz', [
        successfulChoice('2026-09-01T09:00:00.000Z'),
        failedOpen('Théorème de Pythagore'),
      ]);
      const second = attempt('a-2', 'validation_quiz', [
        failedOpen('theoreme  de pythagore'),
        failedChoice(OTHER),
      ]);
      const reference = detectGap(input({ mastery: 40, attempts: [first, second] }));
      const reordered = detectGap(
        input({
          mastery: 40,
          attempts: [
            { ...second, answers: [...second.answers].reverse() },
            { ...first, answers: [...first.answers].reverse() },
          ],
        }),
      );
      expect(reordered).toEqual(reference);

      const frozen = JSON.stringify([first, second]);
      detectGap(input({ mastery: 40, attempts: [first, second] }));
      expect(JSON.stringify([first, second])).toBe(frozen);
    });

    it('reste déterministe sur des entrées aléatoires permutées', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 10 }), (seed) => {
          const attempts = [
            attempt('a-1', 'validation_quiz', [
              failedOpen(`réponse ${String(seed)}`),
              failedChoice(OTHER),
            ]),
            attempt('a-2', 'global_quiz_session', [
              failedOpen(`RÉPONSE ${String(seed)}`),
              successfulChoice('2026-11-08T09:00:00.000Z'),
            ]),
          ];
          const direct = detectGap(input({ mastery: 50, attempts }));
          const reversed = detectGap(
            input({
              mastery: 50,
              attempts: attempts.map((item) => ({
                ...item,
                answers: [...item.answers].reverse(),
              })),
            }),
          );
          expect(reversed).toEqual(direct);
        }),
        FAST_CHECK,
      );
    });

    it('vérifie la borne de levée sur des intervalles aléatoires', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 48 * 3_600_000 }), (offset) => {
          const start = parseInstant('2026-11-09T12:20:00.000Z');
          const result = clearGap(
            clearInput({
              successes: [
                answer({ correct: true, answeredAt: atMs(start) }),
                answer({ correct: true, answeredAt: atMs(start + offset) }),
              ],
              mastery: 80,
            }),
          );
          expect(result.cleared).toBe(offset >= 86_400_000);
        }),
        FAST_CHECK,
      );
    });

    it('refuse une réponse future, une tentative en double et un paramètre hors bornes', () => {
      engineError(
        () =>
          detectGap(
            input({
              attempts: [
                attempt('a-valid', 'validation_quiz', [
                  answer({ correct: false, answeredAt: '2026-11-11T12:20:00.001Z' }),
                ]),
              ],
            }),
          ),
        'attempts.0.answers.0.answeredAt',
      );

      engineError(
        () =>
          detectGap(
            input({
              attempts: [
                attempt('a-valid', 'validation_quiz', [failedChoice()]),
                attempt('a-valid', 'exercise', [failedChoice()]),
              ],
            }),
          ),
        'attempts.1.attemptId',
      );

      engineError(
        () => detectGap(input({ params: { ...PARAMS, masteryThreshold: 120 } })),
        'params.masteryThreshold',
      );
    });

    it('refuse une notion confondue incohérente avec la nature', () => {
      engineError(
        () =>
          detectGap(
            input({
              existingGap: buildGap({ nature: 'forgetting', confusedWith: OTHER }),
            }),
          ),
        'existingGap.confusedWith',
      );
    });

    it('ne réutilise pas une répétition antérieure à la levée', () => {
      const cleared: GapState = buildGap({
        nature: 'confusion',
        confusedWith: OTHER,
        detectedAt: '2026-11-01T10:00:00.000Z',
        clearedAt: '2026-11-05T10:00:00.000Z',
      });
      const result = detectGap(
        input({
          mastery: 90,
          existingGap: cleared,
          attempts: [
            attempt('a-1', 'global_quiz_session', [
              answer({
                correct: false,
                chosenDistractorNotionId: OTHER,
                answeredAt: '2026-11-03T10:00:00.000Z',
              }),
            ]),
            attempt('a-2', 'global_quiz_session', [
              answer({
                correct: false,
                chosenDistractorNotionId: OTHER,
                answeredAt: '2026-11-04T10:00:00.000Z',
              }),
            ]),
          ],
        }),
      );
      expect(result.active).toBe(false);
      expect(result.gap).toEqual(cleared);
      expect(result.evidence).toContain('Aucune tentative');
    });

    it('détecte de nouveau après une levée si une nouvelle tentative échoue', () => {
      const cleared: GapState = buildGap({
        nature: 'forgetting',
        confusedWith: null,
        detectedAt: '2026-11-01T10:00:00.000Z',
        clearedAt: '2026-11-05T10:00:00.000Z',
      });
      const result = detectGap(
        input({
          mastery: 40,
          existingGap: cleared,
          attempts: [
            attempt('a-new', 'validation_quiz', [
              answer({ correct: false, answeredAt: '2026-11-10T10:00:00.000Z' }),
            ]),
          ],
        }),
      );
      expect(result.active).toBe(true);
      expect(result.event).toBe('detected');
      expect(result.gap?.detectedAt).toBe(NOW);
    });

    it('distingue échec et réussite sur une réponse notée', () => {
      const partial = answer({ correct: null, score: 1, maxScore: 4 });
      const half = answer({ correct: null, score: 3, maxScore: 6 });
      expect(isGapFailure(partial, 0.5)).toBe(true);
      expect(isGapSuccess(partial, 0.5)).toBe(false);
      expect(isGapFailure(half, 0.5)).toBe(false);
      expect(isGapSuccess(half, 0.5)).toBe(true);
      expect(isGapFailure(answer({ correct: false }), 0.5)).toBe(true);
      expect(isGapSuccess(answer({ correct: true }), 0.5)).toBe(true);
      expect(isGapFailure(answer({ correct: null, score: null }), 0.5)).toBe(false);
      expect(isGapSuccess(answer({ correct: null, score: null }), 0.5)).toBe(false);
    });

    it('expose les mêmes défauts que la configuration normative', () => {
      expect(DEFAULT_GAP_PARAMS).toEqual(PARAMS);
    });
  });
});
