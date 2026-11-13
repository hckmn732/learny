'use client';

import { useState } from 'react';

import type {
  BrickViewBrick,
  BrickViewStatus,
  CategorizationResponse,
  ClozeResponse,
  MatchingResponse,
  OrderingResponse,
  RecallCardResponse,
  CorrectionView,
} from '@learny/bricks/view';
import {
  CategorizationView,
  ClozeView,
  MatchingView,
  OrderingView,
  RecallCardView,
} from '@learny/bricks/view';
import { Button } from '@learny/ui';

const VERSION = '00000000-0000-4000-8000-000000000503';

const RECALL: BrickViewBrick<'recall_card'> = {
  versionId: VERSION,
  type: 'recall_card',
  notionLabels: ['Variante d’exercice'],
  publicPayload: {
    front: 'Que définit une variante d’exercice comptable ?',
    back: 'Le nombre de périodes comptables d’un exercice, et leurs dates de début et de fin.',
    sourceLabel: 'votre cours du module 2, chapitre 2',
    sources: [],
  },
};

const MATCHING: BrickViewBrick<'matching'> = {
  versionId: VERSION,
  type: 'matching',
  notionLabels: ['Notions de base SAP'],
  publicPayload: {
    instruction: 'Associez chaque notion à sa définition.',
    lefts: [
      { id: 'po', text: 'Société' },
      { id: 'sm', text: 'Plan comptable' },
      { id: 'dev', text: 'Launchpad Fiori' },
    ],
    rights: [
      { id: 'r1', text: 'Entité juridique qui tient sa propre comptabilité' },
      { id: 'r2', text: 'Liste des comptes généraux utilisables' },
      { id: 'r3', text: 'Page d’accueil qui regroupe les applications' },
    ],
    sources: [],
  },
};

const ORDERING: BrickViewBrick<'ordering'> = {
  versionId: VERSION,
  type: 'ordering',
  notionLabels: ['Niveaux d’organisation'],
  publicPayload: {
    instruction:
      'Remettez les niveaux de l’organisation SAP dans l’ordre, du plus large au plus fin.',
    items: [
      { id: 'daily', text: 'Société' },
      { id: 'retro', text: 'Magasin' },
      { id: 'plan', text: 'Mandant' },
      { id: 'review', text: 'Division' },
    ],
    sources: [],
  },
};

const CATEGORIZATION: BrickViewBrick<'categorization'> = {
  versionId: VERSION,
  type: 'categorization',
  notionLabels: ['Données de base et opérations'],
  publicPayload: {
    instruction: 'Classez chaque élément : donnée de base ou opération ?',
    categories: [
      { id: 'base', label: 'Donnée de base' },
      { id: 'op', label: 'Opération' },
    ],
    items: [
      { id: 'cg', text: 'Compte général' },
      { id: 'four', text: 'Fournisseur' },
      { id: 'fact', text: 'Facture d’achat' },
      { id: 'paie', text: 'Paiement' },
      { id: 'cli', text: 'Client' },
      { id: 'regul', text: 'Écriture de régularisation' },
    ],
    sources: [],
  },
};

const CLOZE: BrickViewBrick<'cloze'> = {
  versionId: VERSION,
  type: 'cloze',
  notionLabels: ['Fiori et devises'],
  publicPayload: {
    template:
      'Dans SAP Fiori, chaque application s’ouvre depuis une {{1}} du launchpad, et une société tient sa comptabilité dans sa devise {{2}}.',
    gaps: [{ id: 1 }, { id: 2 }],
    sources: [],
  },
};

const MATCHING_CORRECTION: CorrectionView<'matching'> = {
  kind: 'matching',
  isCorrect: true,
  feedbackTitle: 'Exact.',
  explanation: 'Chaque notion correspond à une définition distincte.',
  pairs: [
    { pairId: 'po', expectedRightId: 'r1', givenRightId: 'r1', correct: true },
    { pairId: 'sm', expectedRightId: 'r2', givenRightId: 'r2', correct: true },
    { pairId: 'dev', expectedRightId: 'r3', givenRightId: 'r3', correct: true },
  ],
};

const ORDERING_CORRECTION: CorrectionView<'ordering'> = {
  kind: 'ordering',
  isCorrect: true,
  feedbackTitle: 'Exact.',
  explanation: 'Du plus large au plus fin : mandant, société, division, magasin.',
  positions: [
    { id: 'plan', expectedIndex: 0, givenIndex: 0, correct: true },
    { id: 'daily', expectedIndex: 1, givenIndex: 1, correct: true },
    { id: 'review', expectedIndex: 2, givenIndex: 2, correct: true },
    { id: 'retro', expectedIndex: 3, givenIndex: 3, correct: true },
  ],
};

const CATEGORIZATION_CORRECTION: CorrectionView<'categorization'> = {
  kind: 'categorization',
  isCorrect: true,
  feedbackTitle: 'Exact.',
  explanation: 'Les données de base sont stables, les opérations bougent.',
  items: [
    { id: 'cg', expectedCategoryId: 'base', givenCategoryId: 'base', correct: true },
    { id: 'four', expectedCategoryId: 'base', givenCategoryId: 'base', correct: true },
    { id: 'fact', expectedCategoryId: 'op', givenCategoryId: 'op', correct: true },
    { id: 'paie', expectedCategoryId: 'op', givenCategoryId: 'op', correct: true },
    { id: 'cli', expectedCategoryId: 'base', givenCategoryId: 'base', correct: true },
    { id: 'regul', expectedCategoryId: 'op', givenCategoryId: 'op', correct: true },
  ],
};

const CLOZE_CORRECTION: CorrectionView<'cloze'> = {
  kind: 'cloze',
  isCorrect: true,
  feedbackTitle: 'Exact.',
  explanation: 'Une tuile ouvre l’application ; la devise interne est celle de la société.',
  gaps: [
    { id: 1, expected: 'tuile', given: 'tuile', correct: true },
    { id: 2, expected: 'interne', given: 'interne', correct: true },
  ],
};

export function GamesDemo({ game }: Readonly<{ game: number }>) {
  const [recall, setRecall] = useState<RecallCardResponse | null>(null);
  const [matching, setMatching] = useState<MatchingResponse | null>(null);
  const [ordering, setOrdering] = useState<OrderingResponse | null>(null);
  const [categorization, setCategorization] = useState<CategorizationResponse | null>(null);
  const [cloze, setCloze] = useState<ClozeResponse | null>(null);
  const [status, setStatus] = useState<BrickViewStatus>('idle');

  const corrected = status === 'corrected';
  return (
    <div className="mx-auto flex w-full max-w-[54.625rem] flex-col gap-22">
      {game === 1 ? (
        <RecallCardView
          brick={RECALL}
          correction={
            corrected
              ? { kind: 'recall_card', isCorrect: true, feedbackTitle: 'Exact.', selfGrade: 'good' }
              : undefined
          }
          onChange={setRecall}
          status={status}
          value={recall}
          variant="game"
        />
      ) : null}
      {game === 2 ? (
        <MatchingView
          brick={MATCHING}
          correction={corrected ? MATCHING_CORRECTION : undefined}
          onChange={setMatching}
          onCheck={() => {
            setStatus('corrected');
          }}
          onReset={() => {
            setMatching(null);
            setStatus('idle');
          }}
          status={status}
          value={matching}
          variant="game"
        />
      ) : null}
      {game === 3 ? (
        <OrderingView
          brick={ORDERING}
          correction={corrected ? ORDERING_CORRECTION : undefined}
          onChange={setOrdering}
          onCheck={() => {
            setStatus('corrected');
          }}
          status={status}
          value={ordering}
          variant="game"
        />
      ) : null}
      {game === 4 ? (
        <CategorizationView
          brick={CATEGORIZATION}
          correction={corrected ? CATEGORIZATION_CORRECTION : undefined}
          onChange={setCategorization}
          onCheck={() => {
            setStatus('corrected');
          }}
          status={status}
          value={categorization}
          variant="game"
        />
      ) : null}
      {game === 5 ? (
        <>
          <ClozeView
            brick={CLOZE}
            correction={corrected ? CLOZE_CORRECTION : undefined}
            onChange={setCloze}
            status={status}
            value={cloze}
            variant="game"
          />
          <Button
            className="self-start"
            data-testid="brick-check"
            onClick={() => {
              setStatus('corrected');
            }}
            size="md"
            variant="dark"
          >
            Vérifier
          </Button>
        </>
      ) : null}
    </div>
  );
}
