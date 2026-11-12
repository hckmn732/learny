// Reference examples of the `choice_question` type. The invalid one has two correct options in
// single mode (CHOICE_SINGLE_NEEDS_ONE).
import type { BrickExample } from '../../payloads';
import { NOTION_A, NOTION_B } from '../example-ids';

import type { ChoiceQuestionPayload } from './schema';

export const choiceQuestionExample: BrickExample<'choice_question'> = {
  valid: {
    stem: 'Quel compte augmente au débit lorsqu’une entreprise encaisse un client ?',
    mode: 'single',
    options: [
      { id: 'a', text: 'Le compte de banque', correct: true, notionId: NOTION_A },
      { id: 'b', text: 'Le compte de capital', correct: false, notionId: NOTION_B },
      { id: 'c', text: 'Le compte de résultat', correct: false, notionId: NOTION_B },
    ],
    explanation:
      'L’encaissement augmente le compte de banque au débit ; le compte de produit est crédité.',
    objective: 'Distinguer un compte d’actif d’un compte de passif',
    sources: [],
  },
  invalid: {
    stem: 'Quel compte augmente au débit lorsqu’une entreprise encaisse un client ?',
    mode: 'single',
    options: [
      { id: 'a', text: 'Le compte de banque', correct: true, notionId: NOTION_A },
      { id: 'b', text: 'Le compte de capital', correct: true, notionId: NOTION_B },
    ],
    explanation: 'Deux options justes ne peuvent pas coexister dans une question à choix unique.',
    objective: 'Distinguer un compte d’actif d’un compte de passif',
    sources: [],
  },
  invalidCode: 'CHOICE_SINGLE_NEEDS_ONE',
};

export type ChoiceQuestionExamplePayload = ChoiceQuestionPayload;
