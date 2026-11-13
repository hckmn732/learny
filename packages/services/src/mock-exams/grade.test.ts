import { describe, expect, it } from 'vitest';

import { gradeExam, type ExamGradedQuestion, type ExamModuleInfo } from './grade';

const MODULES: ExamModuleInfo[] = [
  { moduleId: 'm1', position: 1, label: 'Fondamentaux', studied: true },
  { moduleId: 'm2', position: 2, label: 'Structure', studied: true },
  { moduleId: 'm4', position: 4, label: 'Fournisseurs', studied: false },
  { moduleId: 'm5', position: 5, label: 'Clients', studied: false },
];

function question(
  position: number,
  moduleId: string,
  correct: boolean,
  overrides: Partial<ExamGradedQuestion> = {},
): ExamGradedQuestion {
  const module = MODULES.find((entry) => entry.moduleId === moduleId);
  return {
    position,
    brickVersionId: `00000000-0000-0000-0000-00000000000${String(position)}`,
    typeLabel: 'Choix unique',
    question: `Question ${String(position)}`,
    notionId: `${moduleId}-notion`,
    notionLabel: `Notion ${String(position)}`,
    moduleId,
    modulePosition: module?.position ?? 1,
    moduleLabel: module?.label ?? 'Module',
    studied: module?.studied ?? true,
    isCorrect: correct,
    score: correct ? 25 : 0,
    maxScore: 25,
    given: correct ? 'Bonne réponse' : 'Mauvaise réponse',
    expected: correct ? null : 'Bonne réponse',
    explanation: 'Explication.',
    ...overrides,
  };
}

describe('[SPEC-614] correction de l’examen blanc', () => {
  it('CA-3 — les erreurs diagnostiques ne diminuent pas le score étudié', () => {
    const summary = gradeExam({
      questions: [
        question(1, 'm1', true),
        question(2, 'm2', true),
        question(3, 'm4', false),
        question(4, 'm5', false),
      ],
      modules: MODULES,
      threshold: 70,
    });
    expect(summary.studied).toEqual({ correct: 2, total: 2, score: 100 });
    expect(summary.diagnostic).toEqual({ correct: 0, total: 2, score: 0 });
    expect(summary.score).toBe(50);
    expect(summary.passed).toBe(false);
    expect(summary.modules.find((module) => module.moduleId === 'm4')).toMatchObject({
      studied: false,
      correct: 0,
      total: 1,
      score: 0,
    });
  });

  it('CA-3 — seules les erreurs des modules étudiés deviennent des lacunes', () => {
    const summary = gradeExam({
      questions: [question(1, 'm1', false), question(2, 'm2', true), question(3, 'm4', false)],
      modules: MODULES,
      threshold: 70,
    });
    expect(summary.gaps.map((gap) => gap.moduleId)).toEqual(['m1']);
    expect(summary.plan[0]).toContain('1 notion ajoutée');
  });

  it('BR-PRA-04 — les questions sans réponse comptent comme fausses et restent dans la revue', () => {
    const summary = gradeExam({
      questions: [
        question(1, 'm1', true),
        question(2, 'm2', false, {
          given: 'sans réponse',
          expected: 'La bonne réponse',
        }),
      ],
      modules: MODULES,
      threshold: 70,
    });
    expect(summary.score).toBe(50);
    expect(summary.review).toHaveLength(2);
    expect(summary.review[1]).toMatchObject({
      position: 2,
      isCorrect: false,
      given: 'sans réponse',
      expected: 'La bonne réponse',
    });
  });

  it('CA-2, CA-3 — le seuil s’applique au score global et la revue garde la version jouée', () => {
    const version = '11111111-1111-4111-8111-111111111111';
    const summary = gradeExam({
      questions: [
        question(1, 'm1', true, { brickVersionId: version }),
        question(2, 'm2', true),
        question(3, 'm2', true),
      ],
      modules: MODULES,
      threshold: 70,
    });
    expect(summary.score).toBe(100);
    expect(summary.passed).toBe(true);
    expect(summary.review[0]?.brickVersionId).toBe(version);
    expect(summary.gaps).toEqual([]);
    expect(summary.plan[0]).toContain('Vos prochains quiz globaux');
  });
});
