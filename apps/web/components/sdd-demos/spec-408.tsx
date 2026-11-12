'use client';

import { ENGINE } from '@learny/config/product';
import {
  calculateProgress,
  calculateRetention,
  daysBetween,
  localDateOf,
  type ProgressModule,
  type ProgressNotionState,
  type ProgressSlot,
  type RetentionHorizon,
  type RetentionModule,
  type RetentionReview,
} from '@learny/learning-engine';
import { Badge, ProgressBar, StatCard, StatRow } from '@learny/ui';

import { BaseCard, BaseTokenStyle } from '../sdd/base-tokens';

const AT = '2026-11-11T12:20:00.000Z';
const PARIS = 'Europe/Paris';
const RETENTION_PARAMS = {
  horizonsDays: ENGINE.retention.horizonsDays,
  toleranceDays: ENGINE.retention.toleranceDays,
};
const MASTERY_THRESHOLD = ENGINE.mastery.threshold;

const RETENTION_MODULES: RetentionModule[] = [
  {
    moduleId: 'sap-m1',
    validatedAt: '2026-09-12T10:00:00.000Z',
    notionIds: ['n1', 'n2', 'n3', 'n4', 'n5'],
  },
  {
    moduleId: 'sap-m2',
    validatedAt: '2026-10-11T10:00:00.000Z',
    notionIds: ['n6', 'n7', 'n8', 'n9'],
  },
  {
    moduleId: 'sap-m4',
    validatedAt: '2026-10-12T10:00:00.000Z',
    notionIds: ['n10', 'n11', 'n12', 'n13', 'n14'],
  },
  {
    moduleId: 'sap-m3',
    validatedAt: '2026-11-09T10:00:00.000Z',
    notionIds: ['n15'],
  },
  { moduleId: 'sap-m5', validatedAt: null, notionIds: ['n16'] },
  { moduleId: 'sap-m6', validatedAt: null, notionIds: ['n17'] },
  { moduleId: 'sap-m7', validatedAt: null, notionIds: ['n18'] },
];

const RETENTION_REVIEWS: RetentionReview[] = [
  { reviewId: 'r-n6', notionId: 'n6', reviewedAt: '2026-11-10T09:00:00.000Z', correct: true },
  { reviewId: 'r-n7', notionId: 'n7', reviewedAt: '2026-11-10T09:00:00.000Z', correct: true },
  { reviewId: 'r-n8', notionId: 'n8', reviewedAt: '2026-11-10T09:00:00.000Z', correct: true },
  { reviewId: 'r-n9', notionId: 'n9', reviewedAt: '2026-11-10T09:00:00.000Z', correct: false },
  { reviewId: 'r-n10', notionId: 'n10', reviewedAt: '2026-11-11T09:00:00.000Z', correct: true },
  { reviewId: 'r-n11', notionId: 'n11', reviewedAt: '2026-11-11T09:00:00.000Z', correct: true },
  { reviewId: 'r-n12', notionId: 'n12', reviewedAt: '2026-11-11T09:00:00.000Z', correct: true },
  { reviewId: 'r-n13', notionId: 'n13', reviewedAt: '2026-11-11T09:00:00.000Z', correct: false },
  {
    reviewId: 'r-n10-late',
    notionId: 'n10',
    reviewedAt: '2026-11-11T10:00:00.000Z',
    correct: false,
  },
  {
    reviewId: 'r-n14-out',
    notionId: 'n14',
    reviewedAt: '2026-11-07T09:00:00.000Z',
    correct: false,
  },
  { reviewId: 'r-n1', notionId: 'n1', reviewedAt: '2026-11-11T08:00:00.000Z', correct: true },
  { reviewId: 'r-n2', notionId: 'n2', reviewedAt: '2026-11-11T08:00:00.000Z', correct: true },
  { reviewId: 'r-n3', notionId: 'n3', reviewedAt: '2026-11-11T08:00:00.000Z', correct: true },
  { reviewId: 'r-n4', notionId: 'n4', reviewedAt: '2026-11-11T08:00:00.000Z', correct: true },
  { reviewId: 'r-n5', notionId: 'n5', reviewedAt: '2026-11-11T08:00:00.000Z', correct: false },
];

const RETENTION = calculateRetention({
  modules: RETENTION_MODULES,
  reviews: RETENTION_REVIEWS,
  at: AT,
  timeZone: PARIS,
  params: RETENTION_PARAMS,
});

const NOT_MEASURABLE = calculateRetention({
  modules: [RETENTION_MODULES[1] as RetentionModule],
  reviews: [],
  at: AT,
  timeZone: PARIS,
  params: RETENTION_PARAMS,
});

const PROGRESS_MODULES: ProgressModule[] = [
  { moduleId: 'sap-m1', status: 'validated' },
  { moduleId: 'sap-m2', status: 'validated' },
  { moduleId: 'sap-m3', status: 'validated' },
  { moduleId: 'sap-m4', status: 'open' },
  { moduleId: 'sap-m5', status: 'open' },
  { moduleId: 'sap-m6', status: 'locked' },
  { moduleId: 'sap-m7', status: 'locked' },
];

const SLOT_START = '2026-11-09T09:00:00.000Z';
function slotEnd(minutes: number): string {
  return new Date(Date.parse(SLOT_START) + minutes * 60_000).toISOString();
}

const PROGRESS_SLOTS: ProgressSlot[] = [
  {
    slotId: 's1',
    formationId: 'sap-finance',
    kind: 'course',
    status: 'planned',
    startsAt: SLOT_START,
    endsAt: slotEnd(90),
  },
  {
    slotId: 's2',
    formationId: 'sap-finance',
    kind: 'revision',
    status: 'done',
    startsAt: SLOT_START,
    endsAt: slotEnd(60),
  },
  {
    slotId: 's3',
    formationId: 'sap-finance',
    kind: 'exercise',
    status: 'done',
    startsAt: SLOT_START,
    endsAt: slotEnd(30),
  },
  {
    slotId: 's4',
    formationId: 'sap-finance',
    kind: 'course',
    status: 'cancelled',
    startsAt: SLOT_START,
    endsAt: slotEnd(45),
  },
  {
    slotId: 's5',
    formationId: 'sap-finance',
    kind: 'exercise',
    status: 'missed',
    startsAt: SLOT_START,
    endsAt: slotEnd(30),
  },
  {
    slotId: 's6',
    formationId: 'sap-finance',
    kind: 'validation_quiz',
    status: 'moved',
    startsAt: SLOT_START,
    endsAt: slotEnd(60),
  },
  {
    slotId: 's7',
    formationId: 'sap-finance',
    kind: 'validation_quiz',
    status: 'planned',
    startsAt: SLOT_START,
    endsAt: slotEnd(60),
    movedFromId: 's6',
  },
  {
    slotId: 's8',
    formationId: 'sap-finance',
    kind: 'revision',
    status: 'planned',
    startsAt: SLOT_START,
    endsAt: slotEnd(20),
  },
  {
    slotId: 's9',
    formationId: 'sap-finance',
    kind: 'revision',
    status: 'planned',
    startsAt: SLOT_START,
    endsAt: slotEnd(25),
    movedFromId: 's8',
  },
];

const NOTION_STATES: ProgressNotionState[] = [
  { notionId: 'n1', mastery: 100 },
  { notionId: 'n2', mastery: 92.5 },
  { notionId: 'n3', mastery: 88 },
  { notionId: 'n4', mastery: 85 },
  { notionId: 'n5', mastery: 80 },
  { notionId: 'n6', mastery: 79.99 },
  { notionId: 'n7', mastery: 81 },
  { notionId: 'n8', mastery: 84 },
  { notionId: 'n9', mastery: 90 },
  { notionId: 'n10', mastery: 76 },
  { notionId: 'n11', mastery: 82 },
  { notionId: 'n12', mastery: 95 },
  { notionId: 'n13', mastery: 80.5 },
  { notionId: 'n14', mastery: 80.2 },
  { notionId: 'n15', mastery: 0 },
  { notionId: 'n16', mastery: 60 },
  { notionId: 'n17', mastery: 0 },
  { notionId: 'n18', mastery: 70 },
];

const PROGRESS = calculateProgress({
  modules: PROGRESS_MODULES,
  slots: PROGRESS_SLOTS,
  notionStates: NOTION_STATES,
  masteryThreshold: MASTERY_THRESHOLD,
});

const EMPTY_PROGRESS = calculateProgress({ modules: [], slots: [], notionStates: [] });
const BELOW_THRESHOLD = calculateProgress({
  modules: [],
  slots: [],
  notionStates: [{ notionId: 'n-edge', mastery: 79.99 }],
  masteryThreshold: MASTERY_THRESHOLD,
});

const percent1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const percent2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const integerFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS,
  dateStyle: 'short',
});

const STATUS_LABELS = {
  no_modules: 'Aucun module',
  in_progress: 'En cours',
  complete: 'Terminée',
} as const;
const STATUS_TONES = { no_modules: 'neutral', in_progress: 'orange', complete: 'green' } as const;

const SLOT_STATUS_LABELS: Record<ProgressSlot['status'], string> = {
  planned: 'prévu',
  done: 'fait',
  missed: 'manqué',
  moved: 'déplacé',
  cancelled: 'annulé',
};

function horizonOf(result: readonly RetentionHorizon[], days: number): RetentionHorizon {
  const found = result.find((item) => item.horizonDays === days);
  if (found === undefined) throw new Error(`Horizon ${String(days)} absent.`);
  return found;
}

function rateText(horizon: RetentionHorizon): string {
  return horizon.rate === null ? 'Pas encore mesurable' : `${percent1.format(horizon.rate)}\u00a0%`;
}

function ratioText(horizon: RetentionHorizon): string {
  return `${String(horizon.successful)} / ${String(horizon.reviewed)} notions`;
}

function hoursText(minutes: number): string {
  const totalMinutes = Math.round(minutes);
  const whole = Math.floor(totalMinutes / 60);
  const rest = totalMinutes % 60;
  return `${integerFormat.format(whole)} h ${String(rest).padStart(2, '0')}`;
}

function reviewOffset(review: RetentionReview): string {
  const entry = RETENTION_MODULES.find((item) => item.notionIds.includes(review.notionId));
  if (entry?.validatedAt === null || entry === undefined) return 'module non validé';
  const offset = daysBetween(
    localDateOf(entry.validatedAt, PARIS),
    localDateOf(review.reviewedAt, PARIS),
  );
  return `J+${String(offset)}`;
}

const THIRTY = horizonOf(RETENTION, 30);
const SIXTY = horizonOf(RETENTION, 60);
const EDGE_THIRTY = horizonOf(NOT_MEASURABLE, 30);

const CAPTION = 'border-b border-border py-2 pr-3 text-left font-600';

export default function Spec408Demo() {
  return (
    <>
      <BaseTokenStyle />
      <BaseCard testId="retention-summary" title="Rétention à un et deux mois">
        <div role="status" aria-live="polite">
          <StatRow>
            <StatCard
              tone="dark"
              data-testid="retention-30"
              value={rateText(THIRTY)}
              label={`Rétention à 1 mois · ${ratioText(THIRTY)}`}
            />
            <StatCard
              data-testid="retention-60"
              value={rateText(SIXTY)}
              label={`Rétention à 2 mois · ${ratioText(SIXTY)}`}
            />
            <StatCard
              data-testid="retention-unmeasurable"
              value={rateText(EDGE_THIRTY)}
              label={`${String(EDGE_THIRTY.reviewed)} révision admissible, ${String(
                EDGE_THIRTY.eligible,
              )} notion(s) éligible(s)`}
            />
          </StatRow>
        </div>
        <p className="mt-4 text-13 text-ink-secondary">
          Une fenêtre sans révision renvoie une valeur absente, jamais 0 %. La rétention à 2 mois
          porte sur le module validé le 12/09/2026.
        </p>
      </BaseCard>

      <BaseCard testId="retention-horizons" title="Fenêtres et dénominateurs calculés">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-13">
            <caption className="sr-only">Rétention par horizon</caption>
            <thead>
              <tr>
                <th scope="col" className={CAPTION}>
                  Horizon
                </th>
                <th scope="col" className={CAPTION}>
                  Fenêtre
                </th>
                <th scope="col" className={CAPTION}>
                  Éligibles
                </th>
                <th scope="col" className={CAPTION}>
                  Revues
                </th>
                <th scope="col" className={CAPTION}>
                  Réussies
                </th>
                <th scope="col" className={CAPTION}>
                  Taux
                </th>
              </tr>
            </thead>
            <tbody>
              {[THIRTY, SIXTY].map((horizon) => (
                <tr
                  key={horizon.horizonDays}
                  data-testid={`retention-horizon-${String(horizon.horizonDays)}`}
                >
                  <th scope="row" className="border-b border-divider py-2 pr-3 font-600">
                    {horizon.horizonDays} jours
                  </th>
                  <td className="border-b border-divider py-2 pr-3 tabular-nums">
                    J+{horizon.windowStartDays}..J+{horizon.windowEndDays}
                  </td>
                  <td className="border-b border-divider py-2 pr-3 tabular-nums">
                    {horizon.eligible}
                  </td>
                  <td className="border-b border-divider py-2 pr-3 tabular-nums">
                    {horizon.reviewed}
                  </td>
                  <td className="border-b border-divider py-2 pr-3 tabular-nums">
                    {horizon.successful}
                  </td>
                  <td className="border-b border-divider py-2 tabular-nums">{rateText(horizon)}</td>
                </tr>
              ))}
              <tr data-testid="retention-horizon-edge">
                <th scope="row" className="border-b border-divider py-2 pr-3 font-600">
                  Cas limite
                </th>
                <td className="border-b border-divider py-2 pr-3 tabular-nums">
                  J+{EDGE_THIRTY.windowStartDays}..J+{EDGE_THIRTY.windowEndDays}
                </td>
                <td className="border-b border-divider py-2 pr-3 tabular-nums">
                  {EDGE_THIRTY.eligible}
                </td>
                <td className="border-b border-divider py-2 pr-3 tabular-nums">
                  {EDGE_THIRTY.reviewed}
                </td>
                <td className="border-b border-divider py-2 pr-3 tabular-nums">
                  {EDGE_THIRTY.successful}
                </td>
                <td className="border-b border-divider py-2 tabular-nums">
                  {rateText(EDGE_THIRTY)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p data-testid="retention-denominator" className="mt-3 text-13 text-ink-secondary">
          À 1 mois : {ratioText(THIRTY)} · à 2 mois : {ratioText(SIXTY)} · hors fenêtre, la révision
          n’entre pas au dénominateur.
        </p>
      </BaseCard>

      <BaseCard testId="retention-inputs" title="Entrées réellement utilisées">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="m-0 font-display text-15 font-600">Modules et validations</h3>
            <ul className="m-0 mt-2 list-none p-0 text-13">
              {RETENTION_MODULES.map((entry) => (
                <li
                  key={entry.moduleId}
                  className="flex justify-between border-b border-divider py-1"
                >
                  <span className="font-mono text-12">{entry.moduleId}</span>
                  <span>
                    {entry.validatedAt === null
                      ? 'non validé'
                      : dateFormat.format(new Date(entry.validatedAt))}
                    {' · '}
                    {entry.notionIds.length} notion(s)
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="m-0 font-display text-15 font-600">Révisions datées</h3>
            <ul className="m-0 mt-2 list-none p-0 text-13">
              {RETENTION_REVIEWS.map((review) => (
                <li
                  key={review.reviewId}
                  data-testid={`review-${review.reviewId}`}
                  className="flex justify-between border-b border-divider py-1"
                >
                  <span className="font-mono text-12">{review.notionId}</span>
                  <span>
                    {dateFormat.format(new Date(review.reviewedAt))} · {reviewOffset(review)} ·{' '}
                    {review.correct ? 'réussie' : 'ratée'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </BaseCard>

      <BaseCard testId="progress-summary" title="Avancement de la formation">
        <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-3">
          <p data-testid="progress-percent" className="font-display text-34 font-600 tabular-nums">
            {percent2.format(PROGRESS.progressPercent)}
            {'\u00a0%'}
          </p>
          <Badge tone={STATUS_TONES[PROGRESS.status]}>{STATUS_LABELS[PROGRESS.status]}</Badge>
          <span data-testid="progress-modules" className="text-13 text-ink-secondary">
            {PROGRESS.validatedModules} / {PROGRESS.totalModules} modules validés
          </span>
        </div>
        <div className="mt-4">
          <ProgressBar
            data-testid="progress-bar"
            label="Avancement de la formation"
            tone="lime"
            value={PROGRESS.progressPercent}
          />
        </div>
        <StatRow className="mt-4">
          <StatCard
            data-testid="progress-planned"
            value={hoursText(PROGRESS.plannedMinutes)}
            label="heures prévues"
          />
          <StatCard
            data-testid="progress-completed"
            value={hoursText(PROGRESS.completedMinutes)}
            label="heures faites"
          />
          <StatCard
            data-testid="progress-mastered"
            value={String(PROGRESS.masteredNotions)}
            label={`notions maîtrisées (seuil ${String(MASTERY_THRESHOLD)}\u00a0%)`}
          />
        </StatRow>
      </BaseCard>

      <BaseCard testId="progress-slots" title="Créneaux et volumes">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-13">
            <caption className="sr-only">Créneaux pris en compte</caption>
            <thead>
              <tr>
                <th scope="col" className={CAPTION}>
                  Créneau
                </th>
                <th scope="col" className={CAPTION}>
                  Statut
                </th>
                <th scope="col" className={CAPTION}>
                  Durée
                </th>
                <th scope="col" className={CAPTION}>
                  Comptage
                </th>
              </tr>
            </thead>
            <tbody>
              {PROGRESS_SLOTS.map((slot) => {
                const minutes = (Date.parse(slot.endsAt) - Date.parse(slot.startsAt)) / 60_000;
                const replaced = PROGRESS_SLOTS.some((other) => other.movedFromId === slot.slotId);
                const counted =
                  replaced || slot.status === 'cancelled' || slot.status === 'moved'
                    ? 'exclu'
                    : slot.status === 'done'
                      ? 'prévu et fait'
                      : 'prévu';
                return (
                  <tr key={slot.slotId} data-testid={`slot-${slot.slotId}`}>
                    <td className="border-b border-divider py-2 pr-3 font-mono text-12">
                      {slot.slotId}
                    </td>
                    <td className="border-b border-divider py-2 pr-3">
                      {SLOT_STATUS_LABELS[slot.status]}
                      {replaced ? ' (remplacé)' : ''}
                    </td>
                    <td className="border-b border-divider py-2 pr-3 tabular-nums">
                      {integerFormat.format(minutes)} min
                    </td>
                    <td className="border-b border-divider py-2">{counted}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p data-testid="slots-totals" className="mt-3 text-13 text-ink-secondary">
          Prévision : {hoursText(PROGRESS.plannedMinutes)} · fait :{' '}
          {hoursText(PROGRESS.completedMinutes)}. Les créneaux annulés, manqués et remplacés ne sont
          jamais accomplis.
        </p>
      </BaseCard>

      <BaseCard testId="progress-notions" title="Notions maîtrisées et cas limites">
        <ul className="m-0 grid list-none gap-2 p-0 text-13">
          <li data-testid="progress-edge-threshold" className="rounded-12 bg-canvas p-3">
            Maîtrise exactement 80,00 % :{' '}
            <strong>{PROGRESS.masteredNotions} notions retenues au seuil</strong>.
          </li>
          <li data-testid="progress-edge-below" className="rounded-12 bg-canvas p-3">
            Maîtrise 79,99 % : {BELOW_THRESHOLD.masteredNotions} notion retenue (sous le seuil).
          </li>
          <li data-testid="progress-edge-empty" className="rounded-12 bg-canvas p-3">
            Formation sans module : {percent2.format(EMPTY_PROGRESS.progressPercent)}
            {'\u00a0%'} · statut {STATUS_LABELS[EMPTY_PROGRESS.status].toLowerCase()} (pas de
            division par zéro).
          </li>
        </ul>
      </BaseCard>
    </>
  );
}
