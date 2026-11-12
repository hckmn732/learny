// Reference examples of the `instruction` type, with the table production of Exercice.dc.html.
// The invalid one totals 9 criteria points (CRITERIA_POINTS_MISMATCH).
import type { BrickExample } from '../../payloads';

import type { InstructionPayload } from './schema';

export const instructionExample: BrickExample<'instruction'> = {
  valid: {
    title: 'Justifier un relevé bancaire',
    taskMd:
      'À partir des données ci-dessous, complétez le tableau de rapprochement bancaire et justifiez chaque ligne par une phrase.',
    data: ['Solde du relevé : 12 400 €', 'Solde comptable : 12 150 €', 'Frais bancaires : 250 €'],
    deliverable: 'Un tableau de rapprochement complété et justifié.',
    production: {
      kind: 'table',
      fields: [{ key: 'libelle', label: 'Libellé', type: 'text' }],
      columns: [
        { key: 'debit', label: 'Débit', type: 'number' },
        { key: 'credit', label: 'Crédit', type: 'number' },
        {
          key: 'sens',
          label: 'Sens',
          type: 'select',
          options: [
            { value: 'D', label: 'Débit' },
            { value: 'C', label: 'Crédit' },
          ],
        },
      ],
      minRows: 1,
      maxRows: 5,
      initialRows: 2,
      checks: [
        {
          type: 'sum_equal',
          numberColumn: 'debit',
          groupColumn: 'sens',
          left: ['Débit'],
          right: ['Crédit'],
          leftLabel: 'Débit',
          rightLabel: 'Crédit',
          sideColumnLabel: 'Sens',
        },
      ],
    },
    explanationPrompt: 'Expliquez avec vos mots pourquoi les deux soldes diffèrent.',
    hints: ['Commencez par les frais bancaires, absents du relevé.'],
    criteria: [
      {
        key: 'exactitude',
        label: 'Exactitude des montants',
        points: 4,
        description: 'Montants justes.',
      },
      {
        key: 'justification',
        label: 'Justification des lignes',
        points: 3,
        description: 'Une phrase par ligne.',
      },
      {
        key: 'presentation',
        label: 'Présentation du tableau',
        points: 3,
        description: 'Tableau lisible et complet.',
      },
    ],
    estimatedMinutes: 20,
    passPoints: 8,
    sources: [],
  },
  invalid: {
    title: 'Justifier un relevé bancaire',
    taskMd:
      'À partir des données ci-dessous, complétez le tableau de rapprochement bancaire et justifiez chaque ligne par une phrase.',
    data: ['Solde du relevé : 12 400 €'],
    deliverable: 'Un tableau de rapprochement complété et justifié.',
    production: { kind: 'link' },
    explanationPrompt: null,
    hints: [],
    criteria: [
      { key: 'globale', label: 'Qualité globale', points: 9, description: 'Une note globale.' },
    ],
    estimatedMinutes: 20,
    passPoints: 8,
    sources: [],
  },
  invalidCode: 'CRITERIA_POINTS_MISMATCH',
};

export type InstructionExamplePayload = InstructionPayload;
