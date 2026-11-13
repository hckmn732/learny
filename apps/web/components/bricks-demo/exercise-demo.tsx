'use client';

import { useState } from 'react';

import type { BrickViewBrick, InstructionResponse } from '@learny/bricks/view';
import { InstructionView } from '@learny/bricks/view';

const BRICK: BrickViewBrick<'instruction'> = {
  versionId: '00000000-0000-4000-8000-000000000503',
  type: 'instruction',
  notionLabels: ['Équilibre d’une pièce'],
  publicPayload: {
    title: 'Saisir une pièce équilibrée',
    taskMd:
      'Le 12 novembre 2026, la société **FR01** achète des fournitures de bureau pour **120 €**, payées immédiatement par virement bancaire. Saisissez la pièce comptable correspondante (montants hors taxes, sans TVA pour simplifier).',
    data: ['Société FR01', 'Date de pièce : 12/11/2026', 'Devise : EUR'],
    deliverable: 'Une pièce équilibrée et expliquée.',
    production: {
      kind: 'table',
      fields: [
        {
          key: 'docType',
          label: 'Type de pièce',
          type: 'select',
          options: [
            { value: 'SA', label: 'SA · écriture générale' },
            { value: 'KR', label: 'KR · facture fournisseur' },
            { value: 'DR', label: 'DR · facture client' },
          ],
        },
        { key: 'date', label: 'Date comptable', type: 'text' },
      ],
      columns: [
        {
          key: 'cle',
          label: 'Clé de comptabilisation',
          type: 'select',
          options: [
            { value: '40', label: '40 · débit, compte général' },
            { value: '50', label: '50 · crédit, compte général' },
            { value: '31', label: '31 · crédit, fournisseur' },
            { value: '01', label: '01 · débit, client' },
          ],
        },
        {
          key: 'compte',
          label: 'Compte',
          type: 'select',
          options: [
            { value: '606400', label: '606400 · Fournitures administratives' },
            { value: '512000', label: '512000 · Banque' },
            { value: '401000', label: '401000 · Fournisseurs' },
            { value: '411000', label: '411000 · Clients' },
          ],
        },
        { key: 'montant', label: 'Montant (€)', type: 'number' },
      ],
      minRows: 2,
      maxRows: 4,
      initialRows: 2,
      checks: [
        {
          type: 'sum_equal',
          numberColumn: 'montant',
          groupColumn: 'cle',
          left: ['40', '01'],
          right: ['50', '31'],
          leftLabel: 'Débit',
          rightLabel: 'Crédit',
          sideColumnLabel: 'Sens',
        },
      ],
    },
    explanationPrompt:
      'Pourquoi SAP refuse-t-il d’enregistrer une pièce déséquilibrée ? Une ou deux phrases.',
    hintsCount: 2,
    criteria: [
      { key: 'type', label: 'Type de pièce', points: 2 },
      { key: 'charge', label: 'Poste de charge', points: 2 },
      { key: 'banque', label: 'Poste de banque', points: 2 },
      { key: 'equilibre', label: 'Pièce équilibrée', points: 2 },
      { key: 'explication', label: 'Explication', points: 2 },
    ],
    estimatedMinutes: 15,
    passPoints: 8,
    sources: [],
  },
};

const HINTS = [
  'Il n’y a ni fournisseur ni client à suivre : le paiement est immédiat.',
  'La charge augmente : elle va au débit. La banque diminue : elle va au crédit.',
];

export function ExerciseDemo() {
  const [value, setValue] = useState<InstructionResponse | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  return (
    <div className="mx-auto w-full max-w-[857px]" data-testid="reproduction-exercice">
      <h1 className="mb-12 font-display text-34 font-600 tracking-title">
        Saisir une pièce équilibrée
      </h1>
      <InstructionView
        brick={BRICK}
        hints={HINTS}
        hintsUsed={hintsUsed}
        onChange={setValue}
        onHintRequest={() => {
          setHintsUsed((current) => Math.min(current + 1, HINTS.length));
        }}
        status="idle"
        value={value}
        variant="exercise"
      />
    </div>
  );
}
