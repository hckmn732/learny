// Reference examples of the `matching` type. The invalid one repeats a left text.
import type { BrickExample } from '../../payloads';
import { NOTION_A, NOTION_B, NOTION_C } from '../example-ids';

import type { MatchingPayload } from './schema';

export const matchingExample: BrickExample<'matching'> = {
  valid: {
    instruction: 'Associez chaque document au cycle comptable auquel il se rattache.',
    pairs: [
      { id: 'a', left: 'Facture de vente', right: 'Cycle des ventes', notionId: NOTION_A },
      { id: 'b', left: 'Relevé bancaire', right: 'Cycle de trésorerie', notionId: NOTION_B },
      { id: 'c', left: 'Bulletin de paie', right: 'Cycle des salaires', notionId: NOTION_C },
    ],
    extraRights: ['Cycle des immobilisations'],
    explanation:
      'Chaque pièce justificative appartient à un cycle comptable précis, ce qui structure le classement.',
    sources: [],
  },
  invalid: {
    instruction: 'Associez chaque document au cycle comptable auquel il se rattache.',
    pairs: [
      { id: 'a', left: 'Facture de vente', right: 'Cycle des ventes', notionId: NOTION_A },
      { id: 'b', left: 'facture de vente', right: 'Cycle des achats', notionId: NOTION_B },
    ],
    extraRights: [],
    explanation:
      'Deux colonnes de gauche identiques rendent l’association ambiguë et sont refusées.',
    sources: [],
  },
  invalidCode: 'MATCHING_DUPLICATE',
};

export type MatchingExamplePayload = MatchingPayload;
