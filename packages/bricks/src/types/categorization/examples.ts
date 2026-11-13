// Reference examples of the `categorization` type. The invalid one leaves a category empty.
import type { BrickExample } from '../../payloads';
import { NOTION_A, NOTION_B } from '../example-ids';

import type { CategorizationPayload } from './schema';

export const categorizationExample: BrickExample<'categorization'> = {
  valid: {
    instruction: 'Classez chaque compte dans la catégorie de bilan qui lui correspond.',
    categories: [
      { id: 'actif', label: 'Actif', notionId: NOTION_A },
      { id: 'passif', label: 'Passif', notionId: NOTION_B },
    ],
    items: [
      { id: 'a', text: 'Banque', categoryId: 'actif' },
      { id: 'b', text: 'Stock de marchandises', categoryId: 'actif' },
      { id: 'c', text: 'Capital social', categoryId: 'passif' },
      { id: 'd', text: 'Emprunt bancaire', categoryId: 'passif' },
    ],
    explanation:
      'L’actif regroupe les emplois de l’entreprise, le passif ses ressources durables et ses dettes.',
    sources: [],
  },
  invalid: {
    instruction: 'Classez chaque compte dans la catégorie de bilan qui lui correspond.',
    categories: [
      { id: 'actif', label: 'Actif', notionId: NOTION_A },
      { id: 'passif', label: 'Passif', notionId: NOTION_B },
      { id: 'charges', label: 'Charges', notionId: null },
    ],
    items: [
      { id: 'a', text: 'Banque', categoryId: 'actif' },
      { id: 'b', text: 'Stock de marchandises', categoryId: 'actif' },
      { id: 'c', text: 'Capital social', categoryId: 'passif' },
      { id: 'd', text: 'Emprunt bancaire', categoryId: 'passif' },
    ],
    explanation: 'Une catégorie sans aucun item ne peut pas être corrigée et doit être supprimée.',
    sources: [],
  },
  invalidCode: 'CATEGORY_EMPTY',
};

export type CategorizationExamplePayload = CategorizationPayload;
