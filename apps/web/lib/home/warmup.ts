import type { WarmupSessionKind } from '@learny/contracts';

const SECONDS_PER_QUESTION = 40;

export function warmupDurationMin(count: number): number {
  return Math.max(2, Math.ceil((count * SECONDS_PER_QUESTION) / 60));
}

export function sessionKindLabel(kind: WarmupSessionKind): string {
  switch (kind) {
    case 'validation_quiz':
      return 'quiz';
    case 'course':
      return 'cours';
    case 'exercise':
      return 'exercice';
    case 'mock_exam':
      return 'examen blanc';
    case 'contributions':
      return 'séance d’apports';
    default:
      return 'séance';
  }
}
