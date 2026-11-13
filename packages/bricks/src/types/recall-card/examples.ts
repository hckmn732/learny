// Reference examples of the `recall_card` type.
import type { BrickExample } from '../../payloads';

import type { RecallCardPayload } from './schema';

export const recallCardExample: BrickExample<'recall_card'> = {
  valid: {
    front: 'Que signifie le principe de la partie double ?',
    back: 'Chaque opération est enregistrée au débit d’un compte et au crédit d’un autre, pour le même montant.',
    sourceLabel: 'Guide FI, p. 4',
    mnemonic: '« Un débit, un crédit, même montant. »',
    sources: [],
  },
  invalid: {
    front: 'ok',
    back: 'Trop court pour être une carte de rappel valide.',
    sources: [],
  },
  invalidCode: 'SCHEMA_INVALID',
};

export type RecallCardExamplePayload = RecallCardPayload;
