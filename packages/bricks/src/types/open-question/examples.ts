// Reference examples of the `open_question` type. The invalid one totals 30 criteria points.
import type { BrickExample } from '../../payloads';

import type { OpenQuestionPayload } from './schema';

export const openQuestionExample: BrickExample<'open_question'> = {
  valid: {
    stem: 'Expliquez pourquoi une écriture comptable respecte toujours l’équilibre débit-crédit.',
    expectedElements: [
      'La partie double',
      'L’égalité des débits et des crédits',
      'La traçabilité des flux',
    ],
    criteria: [
      { key: 'principe', label: 'Principe de la partie double', points: 5, description: '' },
      { key: 'equilibre', label: 'Équilibre débit-crédit', points: 5, description: '' },
    ],
    answerMaxChars: 1500,
    modelAnswer:
      'Toute opération affecte au moins deux comptes pour le même montant, ce qui maintient l’équilibre.',
    explanation:
      'La partie double garantit que chaque flux est enregistré deux fois, au débit d’un compte et au crédit d’un autre.',
    objective: 'Justifier le principe de la partie double',
    sources: [],
  },
  invalid: {
    stem: 'Expliquez pourquoi une écriture comptable respecte toujours l’équilibre débit-crédit.',
    expectedElements: ['La partie double'],
    criteria: [
      { key: 'principe', label: 'Principe', points: 10, description: '' },
      { key: 'equilibre', label: 'Équilibre', points: 10, description: '' },
      { key: 'limite', label: 'Limites', points: 10, description: '' },
    ],
    answerMaxChars: 1500,
    modelAnswer: 'Une réponse modèle suffisamment longue pour être acceptée par le schéma.',
    explanation: 'Une explication suffisamment longue pour être acceptée par le schéma.',
    objective: 'Justifier le principe de la partie double',
    sources: [],
  },
  invalidCode: 'CRITERIA_POINTS_MISMATCH',
};

export type OpenQuestionExamplePayload = OpenQuestionPayload;
