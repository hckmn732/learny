'use client';

import { useState } from 'react';

import { ENGINE } from '@learny/config/product';
import {
  FSRS_RATINGS,
  addDays,
  applyReview,
  createNotionCard,
  gradeReview,
  instantAt,
  previewGrades,
  recentValidTimes,
} from '@learny/learning-engine';
import type { BrickFormat, FsrsRating, TimedResponse } from '@learny/learning-engine';
import { Badge, Button } from '@learny/ui';

import { BaseCard, BaseTokenStyle } from '../sdd/base-tokens';

const NOW = '2026-11-11T12:20:00.000Z';
const TZ = 'Europe/Paris';
const NOTION = { id: 'n-s4', label: 'SAP S/4HANA', module: 'Fondamentaux de SAP S/4HANA' };
const RETENTION = ENGINE.fsrs.requestRetention;
const RATING_LABEL: Readonly<Record<FsrsRating, string>> = {
  again: 'Raté',
  hard: 'Difficile',
  good: 'Bon',
  easy: 'Facile',
};
const dueFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TZ,
  dateStyle: 'medium',
  timeStyle: 'short',
});
const seconds = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const formatDue = (iso: string): string => dueFormatter.format(new Date(iso));
const formatSeconds = (ms: number): string => `${seconds.format(ms / 1000)} s`;

function makeHistory(): TimedResponse[] {
  return Array.from({ length: 60 }, (_value, index) => {
    const format: BrickFormat = index < 3 ? 'cloze' : 'choice_question';
    const timeMs =
      index < 3 ? 90_000 : index === 3 ? 0 : index === 4 ? -1_000 : 12_000 + (index % 9) * 1_000;
    return {
      answerId: `hist-${String(index).padStart(2, '0')}`,
      answeredAt: instantAt(addDays('2026-09-01', index), '09:00', TZ),
      format,
      timeMs,
    };
  });
}

const HISTORY = makeHistory();
const HISTORY_20S: TimedResponse[] = Array.from({ length: 5 }, (_value, index) => ({
  answerId: `median-${String(index)}`,
  answeredAt: instantAt(addDays('2026-10-01', index), '09:00', TZ),
  format: 'choice_question',
  timeMs: 20_000,
}));
const CURRENT = { correct: true, timeMs: 9_000, format: 'choice_question' as const };
const CURRENT_DECISION = gradeReview({ ...CURRENT, history: HISTORY, settings: ENGINE.fsrs });
const RECENT = recentValidTimes(HISTORY, 'choice_question', ENGINE.fsrs);
const CARD = createNotionCard(NOW, RETENTION);
const PREVIEW = previewGrades(CARD, NOW, RETENTION);
const RETENTION_ROWS = [0.85, 0.9, 0.95].map((retention) => ({
  retention,
  preview: previewGrades(CARD, NOW, retention),
}));
const CA_CASES = [
  { key: 'false', label: 'Réponse fausse, 1 s', correct: false, timeMs: 1_000, expected: 'again' },
  { key: 'easy', label: 'Juste, 9 s', correct: true, timeMs: 9_000, expected: 'easy' },
  {
    key: 'half',
    label: 'Juste, 10 s (0,5 × médiane)',
    correct: true,
    timeMs: 10_000,
    expected: 'good',
  },
  { key: 'good', label: 'Juste, 20 s', correct: true, timeMs: 20_000, expected: 'good' },
  {
    key: 'double',
    label: 'Juste, 40 s (2 × médiane)',
    correct: true,
    timeMs: 40_000,
    expected: 'good',
  },
  { key: 'hard', label: 'Juste, 41 s', correct: true, timeMs: 41_000, expected: 'hard' },
].map((entry) => ({
  ...entry,
  decision: gradeReview({
    correct: entry.correct,
    timeMs: entry.timeMs,
    format: 'choice_question',
    history: HISTORY_20S,
    settings: ENGINE.fsrs,
  }),
}));

export default function Spec402Demo() {
  const [selected, setSelected] = useState<FsrsRating | null>(null);
  const applied = selected === null ? null : applyReview(CARD, selected, NOW, RETENTION);

  return (
    <>
      <BaseTokenStyle />
      <BaseCard testId="fsrs-inputs" title="Entrées et médiane personnelle">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">Notion</dt>
            <dd data-testid="fsrs-notion" className="font-600">
              {`${NOTION.label} · ${NOTION.module} (${NOTION.id})`}
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">Rétention demandée</dt>
            <dd data-testid="fsrs-retention" className="font-600">
              {`${String(Math.round(RETENTION * 100))} % · fenêtre ${String(ENGINE.fsrs.medianWindow)} · minimum ${String(ENGINE.fsrs.medianMinSamples)}`}
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">Historique de l’apprenant</dt>
            <dd data-testid="fsrs-history" className="font-600">
              {`60 réponses · ${String(RECENT.length)} temps retenus · médiane `}
              <span data-testid="fsrs-median">{formatSeconds(CURRENT_DECISION.medianMs)}</span>
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">Réponse courante</dt>
            <dd className="font-600">
              {`Juste en ${formatSeconds(CURRENT.timeMs)} → `}
              <span data-testid="fsrs-current-rating">
                {CURRENT_DECISION.rating === null
                  ? 'incomplète'
                  : RATING_LABEL[CURRENT_DECISION.rating]}
              </span>
            </dd>
          </div>
        </dl>
        <div
          role="region"
          aria-label="Échantillon de l’historique"
          tabIndex={0}
          className="mt-4 overflow-x-auto"
        >
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">
              Premières réponses de l’historique, dont les valeurs ignorées
            </caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-border py-2 pr-3">
                  Réponse
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3">
                  Format
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3">
                  Temps
                </th>
                <th scope="col" className="border-b border-border py-2">
                  Statut
                </th>
              </tr>
            </thead>
            <tbody>
              {HISTORY.slice(0, 8).map((entry) => {
                const ignored =
                  entry.format !== 'choice_question' || entry.timeMs === null || entry.timeMs <= 0;
                return (
                  <tr key={entry.answerId} data-testid={`history-${String(entry.answerId)}`}>
                    <td className="border-b border-divider py-2 pr-3 font-mono text-xs">
                      {entry.answerId}
                    </td>
                    <td className="border-b border-divider py-2 pr-3">{entry.format}</td>
                    <td className="border-b border-divider py-2 pr-3 tabular-nums">
                      {entry.timeMs === null ? '—' : formatSeconds(entry.timeMs)}
                    </td>
                    <td className="border-b border-divider py-2">
                      <Badge tone={ignored ? 'orange' : 'green'}>
                        {ignored ? 'ignorée' : 'retenue'}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </BaseCard>

      <BaseCard testId="fsrs-grades" title="Note déduite de la justesse et du temps">
        <div role="region" aria-label="Cas de notation" tabIndex={0} className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">
              Cas de la section 11 avec une médiane de 20 secondes
            </caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-border py-2 pr-3">
                  Cas
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3">
                  Médiane
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3">
                  Note attendue
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3">
                  Note calculée
                </th>
                <th scope="col" className="border-b border-border py-2">
                  Résultat
                </th>
              </tr>
            </thead>
            <tbody>
              {CA_CASES.map((entry) => {
                const ok = entry.decision.rating === entry.expected;
                return (
                  <tr key={entry.key} data-testid={`grade-case-${entry.key}`}>
                    <td className="border-b border-divider py-2 pr-3 font-600">{entry.label}</td>
                    <td className="border-b border-divider py-2 pr-3 tabular-nums">
                      {formatSeconds(entry.decision.medianMs)}
                    </td>
                    <td className="border-b border-divider py-2 pr-3">
                      {RATING_LABEL[entry.expected as FsrsRating]}
                    </td>
                    <td
                      data-testid={`grade-actual-${entry.key}`}
                      className="border-b border-divider py-2 pr-3 font-600"
                    >
                      {entry.decision.rating === null ? '—' : RATING_LABEL[entry.decision.rating]}
                    </td>
                    <td className="border-b border-divider py-2">
                      <Badge
                        tone={ok ? 'green' : 'orange'}
                        aria-label={ok ? 'Conforme' : 'Non conforme'}
                      >
                        {ok ? '✓' : '✗'}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </BaseCard>

      <BaseCard testId="fsrs-recall" title="Carte de rappel : quatre échéances">
        <p className="text-sm text-ink-muted">
          {`Carte du ${formatDue(CARD.due)} · état ${CARD.state} · ${String(CARD.reps)} révision(s).`}
        </p>
        <div
          role="group"
          aria-label="Auto-évaluation de la carte de rappel"
          className="mt-4 grid gap-3 sm:grid-cols-2"
        >
          {FSRS_RATINGS.map((rating) => (
            <Button
              key={rating}
              variant={selected === rating ? 'lime' : 'outline'}
              size="lg"
              fullWidth
              aria-pressed={selected === rating}
              data-testid={`recall-${rating}`}
              className="h-auto min-h-60 flex-col items-start px-16 py-3"
              onClick={() => {
                setSelected(rating);
              }}
            >
              <span className="font-700">{RATING_LABEL[rating]}</span>
              <span className="text-13 font-400">
                Échéance :{' '}
                <time dateTime={PREVIEW[rating]} data-testid={`recall-due-${rating}`}>
                  {formatDue(PREVIEW[rating])}
                </time>
              </span>
            </Button>
          ))}
        </div>
        <div
          role="status"
          aria-live="polite"
          data-testid="recall-result"
          className="mt-4 rounded-18 bg-canvas p-4 text-sm"
        >
          {selected === null || applied === null
            ? 'Aucun choix : la carte reste inchangée (CL-4).'
            : `Note ${RATING_LABEL[selected]} appliquée · nouvelle échéance ${formatDue(applied.dueAt)} · état ${applied.card.state} · ${String(applied.card.reps)} révision(s).`}
        </div>
      </BaseCard>

      <BaseCard testId="fsrs-retentions" title="Rétentions 0,85, 0,90 et 0,95">
        <div
          role="region"
          aria-label="Échéances par rétention"
          tabIndex={0}
          className="overflow-x-auto"
        >
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">
              Échéances calculées pour chaque rétention et chaque note
            </caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-border py-2 pr-3">
                  Rétention
                </th>
                {FSRS_RATINGS.map((rating) => (
                  <th key={rating} scope="col" className="border-b border-border py-2 pr-3">
                    {RATING_LABEL[rating]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RETENTION_ROWS.map((row) => (
                <tr
                  key={row.retention}
                  data-testid={`retention-${String(Math.round(row.retention * 100))}`}
                >
                  <th scope="row" className="border-b border-divider py-2 pr-3 font-600">
                    {`${String(Math.round(row.retention * 100))} %`}
                  </th>
                  {FSRS_RATINGS.map((rating) => (
                    <td key={rating} className="border-b border-divider py-2 pr-3">
                      <time dateTime={row.preview[rating]}>{formatDue(row.preview[rating])}</time>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </BaseCard>
    </>
  );
}
