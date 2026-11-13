// Reference examples of the `cloze` type. The invalid template references gap 2 while the single
// gap has id 1 (CLOZE_GAP_MISMATCH).
import type { BrickExample } from '../../payloads';

import type { ClozePayload } from './schema';

export const clozeExample: BrickExample<'cloze'> = {
  valid: {
    template: 'L’état annuel présente les {{1}} et les {{2}} de l’exercice, puis dégage le {{3}}.',
    gaps: [
      { id: 1, answers: ['produits', 'revenus'], hint: 'Ce que l’entreprise gagne' },
      { id: 2, answers: ['charges', 'dépenses'], hint: 'Ce que l’entreprise dépense' },
      { id: 3, answers: ['résultat', 'benefice'], hint: 'La différence des deux' },
    ],
    explanation:
      'Les produits diminués des charges donnent le résultat de l’exercice, bénéfice ou perte.',
    sources: [],
  },
  invalid: {
    template: 'Le compte de résultat présente les {{2}} de l’exercice.',
    gaps: [{ id: 1, answers: ['produits'], hint: 'Ce que l’entreprise gagne' }],
    explanation:
      'Un texte à trous dont le jeton ne correspond pas à l’identifiant du trou est invalide.',
    sources: [],
  },
  invalidCode: 'CLOZE_GAP_MISMATCH',
};

export type ClozeExamplePayload = ClozePayload;
