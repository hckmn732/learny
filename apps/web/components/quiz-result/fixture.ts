import type { QuizResultDto } from '@learny/contracts';

export function resultFixture(overrides: Partial<QuizResultDto> = {}): QuizResultDto {
  return {
    attemptId: '9d1c8a5e-5d0e-4a0b-9a6e-7b2c4d9e1f02',
    attemptNo: 2,
    module: {
      id: '1a2b3c4d-5e6f-4a0b-8c1d-2e3f4a5b6c7e',
      position: 3,
      title: 'Comptabilité générale',
    },
    status: 'graded',
    score: 72,
    provisionalScore: 72,
    threshold: 80,
    passed: false,
    pointsMissing: 8,
    isLastModule: false,
    nextModule: {
      id: '1a2b3c4d-5e6f-4a0b-8c1d-2e3f4a5b6c7d',
      position: 4,
      title: 'Comptabilité fournisseurs',
    },
    history: [
      { attemptNo: 1, score: 58, passed: false },
      { attemptNo: 2, score: 72, passed: false },
    ],
    gaps: [
      {
        notionId: '0b6f2a7e-9a3c-4c1c-8a55-3d1f6f1d2a01',
        label: 'Clé de comptabilisation',
        nature: 'confusion',
        natureLabel: 'Confusion',
        evidence: 'Confondue avec le type de pièce dans 2 réponses.',
        proposal: 'une question qui oppose les deux notions.',
        mastery: 20,
        trainHref: '/formations/f/quiz-global?cible=n',
      },
    ],
    mastered: [{ notionId: '0b6f2a7e-9a3c-4c1c-8a55-3d1f6f1d2a02', label: 'Pièce comptable' }],
    perNotion: [
      {
        notionId: '0b6f2a7e-9a3c-4c1c-8a55-3d1f6f1d2a02',
        label: 'Pièce comptable',
        correct: 2,
        total: 2,
        score: 100,
      },
    ],
    retry: { allowed: false, availableAt: '2026-11-12T12:20:00.000Z', reason: 'delay' },
    remediation: { status: 'ready', href: '/formations/f/modules/m/remediation' },
    pendingOpenCount: 0,
    ...overrides,
  };
}
