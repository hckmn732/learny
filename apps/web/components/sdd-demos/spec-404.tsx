'use client';

import { useState } from 'react';

import { ENGINE } from '@learny/config/product';
import {
  calculateMastery,
  clearGap,
  detectGap,
  type AnswerRecord,
  type GapAttempt,
  type GapNature,
  type GapState,
} from '@learny/learning-engine';
import { Badge, Button } from '@learny/ui';

import { fr } from '../../messages/fr';
import { BaseCard, BaseTokenStyle } from '../sdd/base-tokens';

const t = fr.sdd.spec404;

const NOTION = 'n-s4';
const NOTION_LABEL = 'SAP S/4HANA';
const CONFUSED = 'n-type';
const DETECTED_AT = '2026-11-01T12:20:00.000Z';
const NOW = '2026-11-11T12:20:00.000Z';
const PARAMS = {
  ...ENGINE.gaps,
  masteryThreshold: ENGINE.mastery.threshold,
} as const;

function makeAnswer(
  partial: Partial<AnswerRecord> & Pick<AnswerRecord, 'answerId' | 'attemptId'>,
): AnswerRecord {
  return {
    attemptKind: 'validation_quiz',
    attemptNo: 1,
    source: 'validation',
    notionIds: [NOTION],
    format: 'choice_question',
    correct: true,
    score: 1,
    maxScore: 1,
    selfRating: null,
    timeMs: 20_000,
    answeredAt: DETECTED_AT,
    chosenDistractorNotionId: null,
    confusedWithNotionId: null,
    normalizedResponse: null,
    offTopic: false,
    countsForGaps: true,
    ...partial,
  };
}

const ATTEMPT_ONE_GOOD = makeAnswer({
  answerId: 'a-1-good',
  attemptId: 'attempt-1',
  answeredAt: '2026-10-29T12:20:00.000Z',
});
const ATTEMPT_ONE_BAD = makeAnswer({
  answerId: 'a-1-bad',
  attemptId: 'attempt-1',
  correct: false,
  score: 0,
  chosenDistractorNotionId: CONFUSED,
  answeredAt: '2026-10-29T12:20:00.000Z',
});
const ATTEMPT_TWO_BAD = makeAnswer({
  answerId: 'a-2-bad',
  attemptId: 'attempt-2',
  correct: false,
  score: 0,
  chosenDistractorNotionId: CONFUSED,
  answeredAt: '2026-10-31T12:20:00.000Z',
});

const DETECTION_ANSWERS = [ATTEMPT_ONE_GOOD, ATTEMPT_ONE_BAD, ATTEMPT_TWO_BAD] as const;
const DETECTION_ATTEMPTS: readonly GapAttempt[] = [
  {
    attemptId: 'attempt-1',
    attemptKind: 'validation_quiz',
    answers: [ATTEMPT_ONE_GOOD, ATTEMPT_ONE_BAD],
  },
  {
    attemptId: 'attempt-2',
    attemptKind: 'validation_quiz',
    answers: [ATTEMPT_TWO_BAD],
  },
];

function masteryAt(answers: readonly AnswerRecord[], at: string) {
  return calculateMastery({
    answers: answers.map((answer) => ({
      answerId: answer.answerId,
      attemptId: answer.attemptId,
      score: (answer.score ?? 0) / (answer.maxScore ?? 1),
      answeredAt: answer.answeredAt,
    })),
    at,
    threshold: ENGINE.mastery.threshold,
    halfLifeDays: ENGINE.mastery.halfLifeDays,
  });
}

const DETECTION_MASTERY = masteryAt(DETECTION_ANSWERS, DETECTED_AT);
const DETECTION = detectGap({
  notion: NOTION,
  attempts: DETECTION_ATTEMPTS,
  mastery: DETECTION_MASTERY.mastery,
  now: DETECTED_AT,
  params: PARAMS,
});
const GAP = DETECTION.gap;

const SUCCESS_QUIZ = makeAnswer({
  answerId: 'success-quiz',
  attemptId: 'attempt-global-quiz',
  attemptKind: 'global_quiz_session',
  source: 'global_quiz',
  answeredAt: NOW,
});

const EDGE_LOW_MASTERY = detectGap({
  notion: NOTION,
  attempts: [],
  mastery: 10,
  now: DETECTED_AT,
  params: PARAMS,
});

const EDGE_CONFUSION_FORGETTING = detectGap({
  notion: NOTION,
  attempts: [
    {
      attemptId: 'edge-old',
      attemptKind: 'validation_quiz',
      answers: [
        makeAnswer({
          answerId: 'edge-old-success',
          attemptId: 'edge-old',
          answeredAt: '2026-09-01T12:20:00.000Z',
        }),
      ],
    },
    {
      attemptId: 'edge-recent',
      attemptKind: 'validation_quiz',
      answers: [
        makeAnswer({
          answerId: 'edge-recent-failure',
          attemptId: 'edge-recent',
          correct: false,
          score: 0,
          chosenDistractorNotionId: CONFUSED,
          answeredAt: '2026-10-31T12:20:00.000Z',
        }),
      ],
    },
  ],
  mastery: 40,
  now: DETECTED_AT,
  params: PARAMS,
});

const EDGE_ONE_ATTEMPT = detectGap({
  notion: NOTION,
  attempts: [
    {
      attemptId: 'edge-one',
      attemptKind: 'global_quiz_session',
      answers: [
        makeAnswer({
          answerId: 'edge-one-a',
          attemptId: 'edge-one',
          attemptKind: 'global_quiz_session',
          source: 'global_quiz',
          correct: false,
          score: 0,
          format: 'open_question',
          normalizedResponse: 'Théorème de Pythagore',
          answeredAt: '2026-10-31T12:20:00.000Z',
        }),
        makeAnswer({
          answerId: 'edge-one-b',
          attemptId: 'edge-one',
          attemptKind: 'global_quiz_session',
          source: 'global_quiz',
          correct: false,
          score: 0,
          format: 'open_question',
          normalizedResponse: 'theoreme  de pythagore',
          answeredAt: '2026-10-31T12:20:00.000Z',
        }),
      ],
    },
  ],
  mastery: 90,
  now: DETECTED_AT,
  params: PARAMS,
});

const EXISTING_GAP: GapState = {
  nature: 'misunderstanding',
  confusedWith: null,
  detectedAt: '2026-10-01T12:20:00.000Z',
  evidence: 'Compréhension insuffisante détectée le 1er octobre.',
  clearedAt: null,
};

const EDGE_NATURE_CHANGED = detectGap({
  notion: NOTION,
  attempts: [
    {
      attemptId: 'edge-change',
      attemptKind: 'validation_quiz',
      answers: [
        makeAnswer({
          answerId: 'edge-change-failure',
          attemptId: 'edge-change',
          correct: false,
          score: 0,
          chosenDistractorNotionId: CONFUSED,
          answeredAt: '2026-10-31T12:20:00.000Z',
        }),
      ],
    },
  ],
  mastery: 40,
  now: DETECTED_AT,
  existingGap: EXISTING_GAP,
  params: PARAMS,
});

const percentFormat = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const hoursFormat = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const instantFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  dateStyle: 'short',
  timeStyle: 'short',
});

const percent = (value: number): string => `${percentFormat.format(value)}\u00a0%`;
const instant = (value: string): string => instantFormat.format(new Date(value));

const KIND_LABELS: Readonly<Record<string, string>> = {
  validation_quiz: 'Quiz de validation',
  exercise: 'Exercice',
  mock_exam: 'Examen blanc',
  global_quiz_session: 'Quiz global',
  warmup: 'Échauffement',
};
const FORMAT_LABELS: Readonly<Record<string, string>> = {
  choice_question: 'Choix',
  open_question: 'Ouverte',
  cloze: 'Texte à trous',
};
const SOURCE_LABELS: Readonly<Record<string, string>> = {
  validation: 'Validation',
  global_quiz: 'Quiz global',
  warmup: 'Échauffement',
};

function errorLabel(answer: AnswerRecord): string {
  if (answer.chosenDistractorNotionId !== null) {
    return `Distracteur « ${answer.chosenDistractorNotionId} »`;
  }
  if (answer.normalizedResponse !== null) return `« ${answer.normalizedResponse} »`;
  if (answer.correct === true) return t.inputs.none;
  return t.inputs.none;
}

function NatureBadge({ nature }: Readonly<{ nature: GapNature }>) {
  return (
    <Badge tone={nature === 'confusion' ? 'orange' : 'violet'}>{t.natureLabels[nature]}</Badge>
  );
}

function EventBadge({ event }: Readonly<{ event: string | null }>) {
  if (event === null) return <span>{t.eventLabels.none}</span>;
  const label =
    event === 'detected'
      ? t.eventLabels.detected
      : event === 'nature_changed'
        ? t.eventLabels.nature_changed
        : t.eventLabels.cleared;
  return <Badge tone={event === 'cleared' ? 'green' : 'indigo'}>{label}</Badge>;
}

function CheckValue({ value }: Readonly<{ value: boolean }>) {
  return (
    <Badge tone={value ? 'green' : 'orange'} size="sm">
      {value ? t.clearance.yes : t.clearance.no}
    </Badge>
  );
}

function EdgeRow({
  testId,
  label,
  result,
}: Readonly<{ testId: string; label: string; result: typeof EDGE_LOW_MASTERY }>) {
  return (
    <tr data-testid={testId}>
      <td className="border-b border-divider py-2 pr-3 font-600">{label}</td>
      <td className="border-b border-divider py-2 pr-3">
        <EventBadge event={result.event} />
      </td>
      <td className="border-b border-divider py-2 pr-3">
        {result.nature === null ? t.edge.inactive : <NatureBadge nature={result.nature} />}
      </td>
      <td className="border-b border-divider py-2 font-mono text-xs">
        {result.triggers.length === 0 ? t.edge.none : result.triggers.join(', ')}
      </td>
    </tr>
  );
}

export default function Spec404Demo() {
  const [spaced, setSpaced] = useState(false);
  const successWarmup = makeAnswer({
    answerId: 'success-warmup',
    attemptId: 'attempt-warmup',
    attemptKind: 'warmup',
    source: 'warmup',
    answeredAt: spaced ? '2026-11-10T12:20:00.000Z' : '2026-11-10T12:21:00.000Z',
    countsForGaps: false,
  });
  const successes = [successWarmup, SUCCESS_QUIZ];
  const clearanceMastery = masteryAt(successes, NOW);
  const clearance =
    GAP === null
      ? null
      : clearGap({
          gap: GAP,
          successes,
          mastery: clearanceMastery.mastery,
          now: NOW,
          notion: NOTION,
          params: PARAMS,
        });

  return (
    <>
      <BaseTokenStyle />
      <BaseCard testId="gap-inputs" title={t.inputs.title}>
        <p className="text-sm text-ink-muted">{t.inputs.intro}</p>
        <p data-testid="gap-evaluation" className="mt-2 text-sm">
          {t.inputs.evaluation(instant(DETECTED_AT))}
        </p>
        <div
          className="mt-4 overflow-x-auto"
          role="region"
          aria-label={t.inputs.title}
          tabIndex={0}
        >
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">{t.inputs.title}</caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  {t.inputs.attempt}
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  {t.inputs.kind}
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  {t.inputs.format}
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  {t.inputs.error}
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  {t.inputs.answeredAt}
                </th>
              </tr>
            </thead>
            <tbody>
              {DETECTION_ANSWERS.map((answer) => (
                <tr key={answer.answerId} data-testid={`gap-answer-${answer.answerId}`}>
                  <td className="border-b border-divider py-2 pr-3 font-mono text-xs">
                    {answer.attemptId}
                  </td>
                  <td className="border-b border-divider py-2 pr-3">
                    {KIND_LABELS[answer.attemptKind] ?? answer.attemptKind}
                  </td>
                  <td className="border-b border-divider py-2 pr-3">
                    {FORMAT_LABELS[answer.format] ?? answer.format}
                  </td>
                  <td className="border-b border-divider py-2 pr-3">{errorLabel(answer)}</td>
                  <td className="border-b border-divider py-2 pr-3 tabular-nums">
                    {instant(answer.answeredAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">{t.inputs.notion}</dt>
            <dd data-testid="gap-notion" className="font-600">
              {NOTION_LABEL} ({NOTION})
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">{t.inputs.mastery}</dt>
            <dd data-testid="gap-mastery" className="font-mono font-600">
              {percent(DETECTION_MASTERY.mastery)}
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">{t.inputs.thresholdLabel}</dt>
            <dd className="font-mono font-600">{percent(DETECTION_MASTERY.threshold)}</dd>
          </div>
        </dl>
      </BaseCard>

      <BaseCard testId="gap-detection" title={t.detection.title} role="status">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={DETECTION.active ? 'orange' : 'green'} data-testid="gap-detection-status">
            {DETECTION.active ? t.detection.active : t.detection.inactive}
          </Badge>
          {DETECTION.nature === null ? null : (
            <span data-testid="gap-detection-nature">
              <NatureBadge nature={DETECTION.nature} />
            </span>
          )}
          <span data-testid="gap-detection-event">
            <EventBadge event={DETECTION.event} />
          </span>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">{t.detection.confusedWith}</dt>
            <dd data-testid="gap-confused-with" className="font-mono font-600">
              {DETECTION.confusedWith ?? t.inputs.none}
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">{t.detection.action}</dt>
            <dd data-testid="gap-action" className="font-600">
              {DETECTION.recommendedAction === null
                ? t.inputs.none
                : t.actionLabels[DETECTION.recommendedAction]}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-sm">
          <span className="font-600">{t.detection.triggers}</span>{' '}
          <span data-testid="gap-triggers">
            {DETECTION.triggers.length === 0
              ? t.inputs.none
              : DETECTION.triggers
                  .map((trigger) =>
                    trigger === 'qualifying_attempt'
                      ? t.detection.triggerQualifying
                      : t.detection.triggerRepeated,
                  )
                  .join(' · ')}
          </span>
        </p>
        <p data-testid="gap-evidence" className="mt-2 text-sm text-ink-muted">
          {DETECTION.evidence}
        </p>
      </BaseCard>

      <BaseCard testId="gap-clearance" title={t.clearance.title} role="status">
        <p className="text-sm text-ink-muted">{t.clearance.intro}</p>
        <div
          className="mt-4 overflow-x-auto"
          role="region"
          aria-label={t.clearance.title}
          tabIndex={0}
        >
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">{t.clearance.title}</caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  {t.clearance.success}
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  {t.clearance.source}
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  {t.clearance.answeredAt}
                </th>
              </tr>
            </thead>
            <tbody>
              {successes.map((answer) => (
                <tr key={answer.answerId} data-testid={`clearance-success-${answer.answerId}`}>
                  <td className="border-b border-divider py-2 pr-3 font-mono text-xs">
                    {answer.answerId}
                  </td>
                  <td className="border-b border-divider py-2 pr-3">
                    {SOURCE_LABELS[answer.source] ?? answer.source}
                  </td>
                  <td className="border-b border-divider py-2 pr-3 tabular-nums">
                    {instant(answer.answeredAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Badge
            tone={clearance?.cleared === true ? 'green' : 'orange'}
            data-testid="gap-clearance-status"
          >
            {clearance?.cleared === true ? t.clearance.cleared : t.clearance.maintained}
          </Badge>
          <span data-testid="gap-clearance-event">
            <EventBadge event={clearance?.event ?? null} />
          </span>
          <span data-testid="gap-clearance-interval" className="text-sm tabular-nums">
            {clearance?.intervalHours === null || clearance === null
              ? t.inputs.none
              : `${hoursFormat.format(clearance.intervalHours)}\u00a0h`}
          </span>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">{t.clearance.mastery}</dt>
            <dd data-testid="gap-clearance-mastery" className="font-mono font-600">
              {percent(clearanceMastery.mastery)}
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">{t.clearance.enough}</dt>
            <dd data-testid="gap-check-enough">
              <CheckValue value={clearance?.checks.enoughSuccesses === true} />
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">{t.clearance.spaced}</dt>
            <dd data-testid="gap-check-spaced">
              <CheckValue value={clearance?.checks.spaced === true} />
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">{t.clearance.threshold}</dt>
            <dd data-testid="gap-check-threshold">
              <CheckValue value={clearance?.checks.masteryReached === true} />
            </dd>
          </div>
        </dl>
        <p data-testid="gap-clearance-evidence" className="mt-4 text-sm text-ink-muted">
          {clearance?.evidence ?? t.inputs.none}
        </p>
        <p data-testid="gap-cleared-at" className="mt-1 text-sm">
          {t.clearance.clearedAt} :{' '}
          {clearance?.clearedAt === null || clearance === null
            ? t.inputs.none
            : instant(clearance.clearedAt)}
        </p>
        <Button
          className="mt-4"
          data-testid="gap-toggle-spacing"
          onClick={() => {
            setSpaced((current) => !current);
          }}
        >
          {spaced ? t.clearance.reset : t.clearance.space}
        </Button>
      </BaseCard>

      <BaseCard testId="gap-edge" title={t.edge.title}>
        <p className="text-sm text-ink-muted">{t.edge.intro}</p>
        <div className="mt-4 overflow-x-auto" role="region" aria-label={t.edge.title} tabIndex={0}>
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">{t.edge.title}</caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  {t.inputs.attempt}
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  {t.detection.event}
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  {t.detection.nature}
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  {t.detection.triggers}
                </th>
              </tr>
            </thead>
            <tbody>
              <EdgeRow
                testId="gap-edge-low-mastery"
                label={t.edge.lowMastery}
                result={EDGE_LOW_MASTERY}
              />
              <EdgeRow
                testId="gap-edge-confusion-forgetting"
                label={t.edge.confusionForgetting}
                result={EDGE_CONFUSION_FORGETTING}
              />
              <EdgeRow
                testId="gap-edge-one-attempt"
                label={t.edge.oneAttempt}
                result={EDGE_ONE_ATTEMPT}
              />
              <EdgeRow
                testId="gap-edge-nature-changed"
                label={t.edge.natureChanged}
                result={EDGE_NATURE_CHANGED}
              />
            </tbody>
          </table>
        </div>
      </BaseCard>
    </>
  );
}
