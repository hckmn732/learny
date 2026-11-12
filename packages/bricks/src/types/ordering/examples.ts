// Reference examples of the `ordering` type. The invalid one repeats an item text.
import type { BrickExample } from '../../payloads';

import type { OrderingPayload } from './schema';

export const orderingExample: BrickExample<'ordering'> = {
  valid: {
    instruction: 'Remettez dans l’ordre les étapes de la clôture comptable.',
    items: [
      { id: 'a', text: 'Enregistrer les écritures de l’exercice' },
      { id: 'b', text: 'Justifier les soldes des comptes' },
      { id: 'c', text: 'Arrêter et présenter les états financiers' },
    ],
    explanation: 'La clôture suit l’enregistrement, la justification puis l’arrêté des comptes.',
    sources: [],
  },
  invalid: {
    instruction: 'Remettez dans l’ordre les étapes de la clôture comptable.',
    items: [
      { id: 'a', text: 'Enregistrer les écritures de l’exercice' },
      { id: 'b', text: 'Enregistrer les écritures de l’exercice' },
      { id: 'c', text: 'Arrêter et présenter les états financiers' },
    ],
    explanation:
      'Deux étapes au texte identique ne peuvent pas être ordonnées de manière univoque.',
    sources: [],
  },
  invalidCode: 'ORDERING_DUPLICATE',
};

export type OrderingExamplePayload = OrderingPayload;
