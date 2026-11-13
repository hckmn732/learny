'use client';

import { useState, type ReactNode } from 'react';

import {
  brickExamples,
  evaluateTableChecks,
  gradeBrick,
  opaqueMapping,
  timerState,
  type BrickPayload,
  type BrickType,
  type GradeOutcome,
  type TableProduction,
  type TableResponse,
} from '@learny/bricks';
import { Button, Card, Checkbox, Select, TextField } from '@learny/ui';

const SEED = '99999999-9999-4999-8999-999999999999';
const START = new Date('2026-11-11T12:00:00Z');
const NOW = new Date('2026-11-11T12:20:00Z');
const NUMBER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

interface GradeState {
  outcome: GradeOutcome | null;
  error: string | null;
}

const EMPTY: GradeState = { outcome: null, error: null };

function grade(type: BrickType, payload: unknown, response: unknown): GradeState {
  const graded = gradeBrick(type, payload, response, SEED);
  if (graded.ok) return { outcome: graded.value, error: null };
  return {
    outcome: null,
    error: graded.error.issues.map((issue) => issue.message).join(' '),
  };
}

function Correction({ outcome }: Readonly<{ outcome: GradeOutcome }>) {
  const correction = outcome.correction;
  switch (correction.kind) {
    case 'choice_question':
      return (
        <ul className="mt-2 grid list-none gap-1 p-0 text-13">
          {correction.options.map((option) => (
            <li key={option.id}>
              {option.correct ? '✓' : '✗'} {option.text}
              {option.chosen ? ' · choisi' : ''}
            </li>
          ))}
        </ul>
      );
    case 'cloze':
      return (
        <ul className="mt-2 grid list-none gap-1 p-0 text-13">
          {correction.gaps.map((gap) => (
            <li key={gap.id}>
              Trou {gap.id} : {gap.correct ? '✓' : '✗'} attendu « {gap.expected} »
            </li>
          ))}
        </ul>
      );
    case 'matching':
      return (
        <ul className="mt-2 grid list-none gap-1 p-0 text-13">
          {correction.pairs.map((pair) => (
            <li key={pair.pairId}>
              {pair.correct ? '✓' : '✗'} {pair.left} → {pair.givenRight ?? 'non relié'} (attendu «{' '}
              {pair.expectedRight} »)
            </li>
          ))}
        </ul>
      );
    case 'ordering':
      return (
        <ol className="mt-2 grid list-none gap-1 p-0 text-13">
          {correction.positions.map((position) => (
            <li key={position.id}>
              {position.correct ? '✓' : '✗'} {position.text} · attendu {position.expectedIndex + 1},
              donné {position.givenIndex + 1}
            </li>
          ))}
        </ol>
      );
    case 'categorization':
      return (
        <ul className="mt-2 grid list-none gap-1 p-0 text-13">
          {correction.items.map((item) => (
            <li key={item.id}>
              {item.correct ? '✓' : '✗'} {item.text} → {item.givenCategoryLabel ?? 'non classé'}{' '}
              (attendu « {item.expectedCategoryLabel} »)
            </li>
          ))}
        </ul>
      );
    case 'recall_card':
      return (
        <p className="mt-2 text-13">
          Verso : {correction.back} · note FSRS {correction.fsrsGrade}
        </p>
      );
    case 'open_question':
    case 'instruction':
    case 'scripted_dialogue':
      return (
        <p className="mt-2 text-13">
          Note du tuteur : {correction.points} / {correction.maxPoints}
        </p>
      );
    case 'none':
      return null;
  }
}

function GradeResult({ type, state }: Readonly<{ type: string; state: GradeState }>) {
  return (
    <div data-testid={`grade-result-${type}`} aria-live="polite" className="mt-4 min-h-12 text-14">
      {state.error === null ? null : (
        <p className="m-0 rounded-12 bg-orange-soft px-12 py-8 font-600 text-orange-ink">
          Réponse invalide : {state.error}
        </p>
      )}
      {state.outcome === null ? null : (
        <>
          <p
            className={`m-0 inline-block rounded-12 px-12 py-8 font-700 ${
              state.outcome.isCorrect
                ? 'bg-green-soft text-green-ink'
                : 'bg-orange-soft text-orange-ink'
            }`}
          >
            {state.outcome.feedbackTitle} · {Math.round(state.outcome.score * 100)} %
          </p>
          {state.outcome.confusions.length === 0 ? null : (
            <p className="mt-2 text-13">
              Confusion :{' '}
              {state.outcome.confusions
                .map((confusion) => `${confusion.notionId} → ${confusion.confusedWithNotionId}`)
                .join(', ')}
            </p>
          )}
          <Correction outcome={state.outcome} />
        </>
      )}
      {state.error === null && state.outcome === null ? (
        <p className="m-0 text-13 text-ink-muted">En attente de vérification.</p>
      ) : null}
    </div>
  );
}

function GradeCard({
  type,
  title,
  description,
  children,
}: Readonly<{ type: string; title: string; description: string; children: ReactNode }>) {
  return (
    <Card data-testid={`grade-card-${type}`} labelledBy={`grade-title-${type}`}>
      <h2 id={`grade-title-${type}`} className="font-display text-xl font-600">
        {title}
      </h2>
      <p className="mt-1 text-13 text-ink-muted">{description}</p>
      <div className="mt-4 grid gap-4">{children}</div>
    </Card>
  );
}

function ChoiceCard() {
  const payload = brickExamples.choice_question.valid;
  const [selected, setSelected] = useState<string | null>(null);
  const [state, setState] = useState<GradeState>(EMPTY);

  return (
    <GradeCard
      type="choice_question"
      title="Question à choix"
      description="Une seule option juste ; le distracteur choisi porte sa notion."
    >
      {payload.options.map((option) => (
        <Checkbox
          key={option.id}
          data-testid={`grade-choice-option-${option.id}`}
          label={option.text}
          checked={selected === option.id}
          onChange={(event) => {
            setSelected(event.target.checked ? option.id : null);
          }}
        />
      ))}
      <Button
        type="button"
        variant="lime"
        data-testid="grade-check-choice_question"
        disabled={selected === null}
        onClick={() => {
          setState(
            grade('choice_question', payload, { optionIds: selected === null ? [] : [selected] }),
          );
        }}
      >
        Vérifier
      </Button>
      <GradeResult type="choice_question" state={state} />
    </GradeCard>
  );
}

function ClozeCard() {
  const payload: BrickPayload<'cloze'> = {
    template:
      'Le journal {{1}} réunit dans une seule table les écritures de la finance et du contrôle de gestion.',
    gaps: [{ id: 1, answers: ['universel'], hint: 'Le journal de S/4HANA' }],
    explanation:
      'Le journal universel (ACDOCA) réunit les écritures de la finance et du contrôle de gestion.',
    sources: [],
  };
  const [value, setValue] = useState('');
  const [state, setState] = useState<GradeState>(EMPTY);

  return (
    <GradeCard
      type="cloze"
      title="Texte à trous"
      description="Comparaison sans casse ni accents ; aucune tolérance aux fautes."
    >
      <p className="m-0 text-14">{payload.template.replace('{{1}}', '__________')}</p>
      <TextField
        label="Mot manquant"
        data-testid="grade-cloze-gap-1"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
        }}
      />
      <Button
        type="button"
        variant="lime"
        data-testid="grade-check-cloze"
        onClick={() => {
          setState(grade('cloze', payload, { gaps: { '1': value } }));
        }}
      >
        Vérifier
      </Button>
      <GradeResult type="cloze" state={state} />
    </GradeCard>
  );
}

function MatchingCard() {
  const payload = brickExamples.matching.valid;
  const rights = opaqueMapping(payload, SEED);
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [state, setState] = useState<GradeState>(EMPTY);

  return (
    <GradeCard
      type="matching"
      title="Association"
      description="Les droites sont mélangées avec des identifiants opaques ; une erreur entre notions devient une confusion."
    >
      {payload.pairs.map((pair) => (
        <Select
          key={pair.id}
          label={pair.left}
          data-testid={`grade-matching-pair-${pair.id}`}
          value={pairs[pair.id] ?? ''}
          options={[
            { value: '', label: 'Choisir…' },
            ...rights.map((right) => ({ value: right.id, label: right.text })),
          ]}
          onChange={(event) => {
            setPairs((previous) => ({ ...previous, [pair.id]: event.target.value }));
          }}
        />
      ))}
      <Button
        type="button"
        variant="lime"
        data-testid="grade-check-matching"
        onClick={() => {
          setState(
            grade('matching', payload, {
              pairs: Object.fromEntries(
                payload.pairs.map((pair) => [
                  pair.id,
                  pairs[pair.id] === undefined || pairs[pair.id] === '' ? null : pairs[pair.id],
                ]),
              ),
            }),
          );
        }}
      >
        Vérifier
      </Button>
      <GradeResult type="matching" state={state} />
    </GradeCard>
  );
}

function OrderingCard() {
  const payload = brickExamples.ordering.valid;
  const [order, setOrder] = useState<string[]>(() =>
    payload.items.map((item) => item.id).reverse(),
  );
  const [state, setState] = useState<GradeState>(EMPTY);

  return (
    <GradeCard
      type="ordering"
      title="Remise en ordre"
      description="Chaque position juste compte ; la correction affiche l’écart attendu."
    >
      {order.map((id, index) => (
        <Select
          key={`position-${String(index)}`}
          label={`Position ${String(index + 1)}`}
          data-testid={`grade-ordering-position-${String(index)}`}
          value={id}
          options={payload.items.map((item) => ({ value: item.id, label: item.text }))}
          onChange={(event) => {
            setOrder((previous) =>
              previous.map((current, position) =>
                position === index ? event.target.value : current,
              ),
            );
          }}
        />
      ))}
      <Button
        type="button"
        variant="lime"
        data-testid="grade-check-ordering"
        onClick={() => {
          setState(grade('ordering', payload, { order }));
        }}
      >
        Vérifier
      </Button>
      <GradeResult type="ordering" state={state} />
    </GradeCard>
  );
}

function CategorizationCard() {
  const payload = brickExamples.categorization.valid;
  const [assignments, setAssignments] = useState<Record<string, string>>(() =>
    Object.fromEntries(payload.items.map((item) => [item.id, item.categoryId])),
  );
  const [state, setState] = useState<GradeState>(EMPTY);

  return (
    <GradeCard
      type="categorization"
      title="Classement"
      description="Une catégorie par élément ; une erreur entre deux notions devient une confusion."
    >
      {payload.items.map((item) => (
        <Select
          key={item.id}
          label={item.text}
          data-testid={`grade-categorization-item-${item.id}`}
          value={assignments[item.id] ?? ''}
          options={payload.categories.map((category) => ({
            value: category.id,
            label: category.label,
          }))}
          onChange={(event) => {
            setAssignments((previous) => ({ ...previous, [item.id]: event.target.value }));
          }}
        />
      ))}
      <Button
        type="button"
        variant="lime"
        data-testid="grade-check-categorization"
        onClick={() => {
          setState(
            grade('categorization', payload, {
              assignments: Object.fromEntries(
                payload.items.map((item) => [item.id, assignments[item.id] ?? null]),
              ),
            }),
          );
        }}
      >
        Vérifier
      </Button>
      <GradeResult type="categorization" state={state} />
    </GradeCard>
  );
}

function RecallCard() {
  const payload = brickExamples.recall_card.valid;
  const [selfGrade, setSelfGrade] = useState<'again' | 'hard' | 'good' | 'easy'>('good');
  const [state, setState] = useState<GradeState>(EMPTY);

  return (
    <GradeCard
      type="recall_card"
      title="Carte de rappel"
      description="L’auto-évaluation est la note FSRS (BR-MEM-02)."
    >
      <p className="m-0 text-14">
        <strong>Recto :</strong> {payload.front}
      </p>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['again', 'Raté'],
            ['hard', 'Difficile'],
            ['good', 'Bon'],
            ['easy', 'Facile'],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            variant={selfGrade === value ? 'dark' : 'outline'}
            data-testid={`grade-recall-${value}`}
            onClick={() => {
              setSelfGrade(value);
              setState(grade('recall_card', payload, { selfGrade: value }));
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <Button
        type="button"
        variant="lime"
        data-testid="grade-check-recall_card"
        onClick={() => {
          setState(grade('recall_card', payload, { selfGrade }));
        }}
      >
        Vérifier
      </Button>
      <GradeResult type="recall_card" state={state} />
    </GradeCard>
  );
}

const TABLE_PRODUCTION: TableProduction = {
  kind: 'table',
  fields: [{ key: 'libelle', label: 'Libellé', type: 'text' }],
  columns: [
    {
      key: 'sens',
      label: 'Sens',
      type: 'select',
      options: [
        { value: 'Débit', label: 'Débit' },
        { value: 'Crédit', label: 'Crédit' },
      ],
    },
    { key: 'montant', label: 'Montant', type: 'number' },
  ],
  minRows: 2,
  maxRows: 4,
  initialRows: 2,
  checks: [
    {
      type: 'sum_equal',
      numberColumn: 'montant',
      groupColumn: 'sens',
      left: ['Débit'],
      right: ['Crédit'],
      leftLabel: 'Débit',
      rightLabel: 'Crédit',
      sideColumnLabel: 'Sens',
    },
  ],
};

function TableCard() {
  const [rows, setRows] = useState<Array<Record<string, string>>>(() => [
    { sens: '', montant: '' },
    { sens: '', montant: '' },
  ]);
  const values: TableResponse = { fields: { libelle: 'Pièce comptable' }, rows };
  const check = evaluateTableChecks(TABLE_PRODUCTION, values)[0];

  return (
    <GradeCard
      type="table"
      title="Tableau · contrôle en direct"
      description="Somme débit = somme crédit, comparée au centime ; l’état suit la saisie."
    >
      <div className="grid gap-3">
        {rows.map((row, index) => (
          <div key={`row-${String(index)}`} className="grid gap-3 sm:grid-cols-2">
            <Select
              label={`Sens de la ligne ${String(index + 1)}`}
              data-testid={`grade-table-row-${String(index)}-sens`}
              value={row.sens ?? ''}
              options={[
                { value: '', label: 'Choisir…' },
                { value: 'Débit', label: 'Débit' },
                { value: 'Crédit', label: 'Crédit' },
              ]}
              onChange={(event) => {
                setRows((previous) =>
                  previous.map((current, position) =>
                    position === index ? { ...current, sens: event.target.value } : current,
                  ),
                );
              }}
            />
            <TextField
              label={`Montant de la ligne ${String(index + 1)}`}
              data-testid={`grade-table-row-${String(index)}-montant`}
              inputMode="decimal"
              value={row.montant ?? ''}
              onChange={(event) => {
                setRows((previous) =>
                  previous.map((current, position) =>
                    position === index ? { ...current, montant: event.target.value } : current,
                  ),
                );
              }}
            />
          </div>
        ))}
      </div>
      <p data-testid="grade-table-totals" aria-live="polite" className="m-0 text-14">
        Débit {NUMBER.format(check?.leftSum ?? 0)} € · Crédit {NUMBER.format(check?.rightSum ?? 0)}{' '}
        €
      </p>
      <p
        data-testid="grade-table-state"
        aria-live="polite"
        className={`m-0 inline-block rounded-12 px-12 py-8 font-700 ${
          check?.state === 'balanced'
            ? 'bg-green-soft text-green-ink'
            : check?.state === 'unbalanced'
              ? 'bg-orange-soft text-orange-ink'
              : 'bg-surface-muted text-ink-secondary'
        }`}
      >
        {check?.label ?? 'Pas encore de montant'}
      </p>
      <p className="m-0 text-13 text-ink-muted">
        Lignes comptées : groupe « {check?.sideByRow.join(' · ') || '—'} ».
      </p>
    </GradeCard>
  );
}

function TimerCard() {
  const state = timerState({ startedAt: START, durationSec: 2400, warnAtSec: 300, now: NOW });
  return (
    <GradeCard
      type="timer"
      title="Minuteur"
      description="Horloge serveur figée au 2026-11-11T12:20:00Z ; démarrage à 12:00:00Z, durée 40 min."
    >
      <p
        data-testid="grade-timer"
        role="timer"
        aria-label="Temps restant : 20 minutes"
        className="m-0 font-display text-34 font-600"
      >
        {state.display}
      </p>
      <p className="m-0 text-13 text-ink-muted">
        {state.expired ? 'Temps écoulé' : state.warning ? 'Alerte orange' : 'Temps restant'}
      </p>
    </GradeCard>
  );
}

const INSTRUCTION_SUMMARY = 'Barème de l’exercice : 10 points, deux indices à −1 point.';

export default function Spec502Demo() {
  return (
    <div className="mt-6 grid gap-6">
      <Card data-testid="grade-legend" labelledBy="grade-legend-title">
        <h2 id="grade-legend-title" className="font-display text-xl font-600">
          États de correction
        </h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <span
            data-testid="grade-token-success"
            className="inline-block rounded-12 bg-green-soft px-12 py-8 font-700 text-green-ink"
          >
            Exact.
          </span>
          <span
            data-testid="grade-token-error"
            className="inline-block rounded-12 bg-orange-soft px-12 py-8 font-700 text-orange-ink"
          >
            Pas tout à fait.
          </span>
        </div>
        <p className="mt-3 text-13 text-ink-muted">{INSTRUCTION_SUMMARY}</p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChoiceCard />
        <ClozeCard />
        <MatchingCard />
        <OrderingCard />
        <CategorizationCard />
        <RecallCard />
        <TableCard />
        <TimerCard />
      </div>
    </div>
  );
}
