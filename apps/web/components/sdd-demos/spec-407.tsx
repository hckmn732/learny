'use client';

import { useState } from 'react';

import { ENGINE } from '@learny/config/product';
import {
  localDateOf,
  planSchedule,
  replanSchedule,
  type ExistingPlannerSlot,
  type PlanResult,
  type PlannerFormation,
  type PlannerPreferences,
  type PlannedSlot,
  type ReplanOption,
} from '@learny/learning-engine';
import { Badge, Button } from '@learny/ui';

import { BaseCard, BaseTokenStyle } from '../sdd/base-tokens';

const TZ = 'Europe/Paris';
const NOW = '2026-11-11T12:20:00.000Z';
const PARAMS = ENGINE.planner;

const FORMATIONS: readonly PlannerFormation[] = [
  {
    formationId: 'sap',
    title: 'SAP S/4HANA Finance',
    endDate: '2026-11-25',
    objectives: ['exam'],
    modules: [
      {
        moduleId: 'sap-m1',
        position: 1,
        title: 'Fondamentaux',
        hours: 8,
        hasExercise: true,
        deadline: '2026-11-18',
        chapters: [
          { chapterId: 'sap-m1-c1', position: 1, title: 'Architecture' },
          { chapterId: 'sap-m1-c2', position: 2, title: 'Navigation Fiori' },
        ],
      },
      {
        moduleId: 'sap-m2',
        position: 2,
        title: 'Structure organisationnelle',
        hours: 5,
        deadline: '2026-11-24',
        chapters: [{ chapterId: 'sap-m2-c1', position: 1, title: 'Sociétés et devises' }],
      },
    ],
  },
  {
    formationId: 'cg',
    title: 'Contrôle de gestion',
    endDate: '2026-11-27',
    modules: [
      {
        moduleId: 'cg-m1',
        position: 1,
        title: 'Coûts et marges',
        hours: 4,
        chapters: [
          { chapterId: 'cg-m1-c1', position: 1, title: 'Coûts directs' },
          { chapterId: 'cg-m1-c2', position: 2, title: 'Seuil de rentabilité' },
        ],
      },
    ],
  },
];

const PREFERENCES: PlannerPreferences = {
  tz: TZ,
  availability: {
    hoursPerDay: 4,
    studyDays: [1, 2, 3, 4, 5],
    preferredSlots: ['matin', 'apres_midi'],
  },
  holidays: ['2026-11-11'],
};

const TIGHT_PREFERENCES: PlannerPreferences = {
  ...PREFERENCES,
  availability: { ...PREFERENCES.availability, hoursPerDay: 3 },
};

const TIGHT_FORMATIONS: readonly PlannerFormation[] = FORMATIONS.map((formation) =>
  formation.formationId === 'sap' ? { ...formation, endDate: '2026-11-13' } : formation,
);

const BASE = planSchedule({
  formations: FORMATIONS,
  preferences: PREFERENCES,
  params: PARAMS,
  now: NOW,
});

const KIND_LABELS: Record<string, string> = {
  contributions: 'Apports',
  course: 'Cours',
  exercise: 'Exercice',
  validation_quiz: 'Quiz de validation',
  buffer: 'Marge',
  global_quiz: 'Quiz global',
  sprint: 'Sprint',
  mock_exam: 'Examen blanc',
  revision: 'Révision',
  warmup: 'Échauffement',
  micro_session: 'Micro-séance',
  weekly_review: 'Bilan',
};

const KIND_TONES: Record<string, 'neutral' | 'indigo' | 'violet' | 'orange' | 'green' | 'lime'> = {
  contributions: 'neutral',
  course: 'indigo',
  exercise: 'violet',
  validation_quiz: 'orange',
  buffer: 'green',
  global_quiz: 'lime',
  sprint: 'orange',
  mock_exam: 'violet',
};

const timeFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
});

const dayFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60))} h ${String(minutes % 60).padStart(2, '0')}`;
}

function slotLabel(slot: PlannedSlot): string {
  return `${timeFormatter.format(new Date(slot.startsAt))}–${timeFormatter.format(
    new Date(slot.endsAt),
  )} · ${KIND_LABELS[slot.kind] ?? slot.kind}`;
}

function statusLabel(slot: PlannedSlot): string {
  if (slot.status === 'missed') return 'manquée';
  if (slot.status === 'done') return 'terminée';
  if (slot.status === 'moved') return 'déplacée';
  if (slot.status === 'cancelled') return 'annulée';
  return 'prévue';
}

function optionsLabel(option: ReplanOption): string {
  if (option.kind === 'shift_end') {
    return option.feasible
      ? `Décaler la fin au ${option.projectedEndDate ?? option.currentEndDate} (+${String(option.extraDays ?? 0)} j)`
      : 'Décaler la fin';
  }
  if (option.kind === 'increase_volume') {
    return option.feasible
      ? `Augmenter le volume à ${String(option.newHoursPerDay)} h/jour`
      : `Augmenter le volume — non réalisable même à 6 h/jour`;
  }
  return option.feasible
    ? `Alléger de ${String(option.removedMinutes)} min`
    : `Alléger — non réalisable (${String(option.removedMinutes)} min retirées au maximum)`;
}

export default function Spec407Demo() {
  const [result, setResult] = useState<PlanResult>(BASE);
  const [missed, setMissed] = useState(false);

  function simulateMissedSession() {
    const source = BASE.slots.find((slot) => slot.kind === 'validation_quiz');
    const existing: ExistingPlannerSlot[] =
      source === undefined
        ? []
        : [
            {
              slotId: 'demo-missed-quiz',
              formationId: source.formationId,
              moduleId: source.moduleId,
              kind: source.kind,
              title: source.title,
              startsAt: source.startsAt,
              endsAt: source.endsAt,
              status: 'missed',
              createdBy: 'planner',
            },
          ];
    setMissed(true);
    setResult(
      replanSchedule({
        formations: TIGHT_FORMATIONS,
        preferences: TIGHT_PREFERENCES,
        params: PARAMS,
        existingSlots: existing,
        now: NOW,
        reason: 'session_missed',
      }),
    );
  }

  const days = new Map<string, PlannedSlot[]>();
  for (const slot of result.slots) {
    const day = localDateOf(slot.startsAt, TZ);
    const entries = days.get(day) ?? [];
    entries.push(slot);
    days.set(day, entries);
  }
  const missedSlots = result.slots.filter((slot) => slot.status === 'missed');

  return (
    <>
      <BaseTokenStyle />
      <BaseCard testId="planner-inputs" title="Entrées du calcul">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">Instant et fuseau</dt>
            <dd className="font-mono">{`${NOW} · ${TZ}`}</dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">Rythme</dt>
            <dd data-testid="planner-rhythm">
              {`${String(result.remainingCapacity[0]?.totalMinutes ?? 0)} min/jour · jours 1–5 · matin et après-midi`}
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">Jours fériés exclus</dt>
            <dd data-testid="planner-holidays">2026-11-11</dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">Paramètres</dt>
            <dd>
              {`quiz ${String(PARAMS.validationQuizMinutes)} min · marge ${String(PARAMS.bufferMinutes)} min · quiz global ${String(PARAMS.globalQuizMinutes)} min · sprint ${String(PARAMS.sprintMinutes)} min`}
            </dd>
          </div>
        </dl>
        <table className="mt-4 w-full border-collapse text-left text-sm">
          <caption className="sr-only">Formations planifiées</caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-border py-2 pr-3">
                Formation
              </th>
              <th scope="col" className="border-b border-border py-2 pr-3">
                Fin
              </th>
              <th scope="col" className="border-b border-border py-2">
                Modules
              </th>
            </tr>
          </thead>
          <tbody>
            {(missed ? TIGHT_FORMATIONS : FORMATIONS).map((formation) => (
              <tr
                key={formation.formationId}
                data-testid={`planner-formation-${formation.formationId}`}
              >
                <td className="border-b border-divider py-2 pr-3 font-600">{formation.title}</td>
                <td className="border-b border-divider py-2 pr-3 tabular-nums">
                  {formation.endDate}
                </td>
                <td className="border-b border-divider py-2 tabular-nums">
                  {String(formation.modules.length)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </BaseCard>

      <BaseCard testId="planner-calendar" title="Calendrier calculé">
        <p data-testid="planner-status" role="status" aria-live="polite" className="text-sm">
          {missed
            ? 'Séance manquée simulée · le rythme passe à 3 h/jour et la fin SAP au 13 novembre · options calculées sans application.'
            : `Plan initial · ${String(result.slots.length)} créneaux · ${String(missedSlots.length)} séance(s) manquée(s).`}
        </p>
        <div className="mt-4 space-y-4">
          {[...days.entries()].map(([day, slots]) => (
            <article key={day} data-testid={`planner-day-${day}`}>
              <h3 className="font-display text-base font-600 capitalize">
                {dayFormatter.format(new Date(`${day}T12:00:00.000Z`))}
              </h3>
              <ul className="mt-2 space-y-1">
                {slots.map((slot, index) => (
                  <li
                    key={slot.slotId}
                    data-testid={`planner-slot-${String(index)}`}
                    className="flex flex-wrap items-center gap-2 rounded-12 bg-canvas px-3 py-2 text-sm"
                  >
                    <span className="tabular-nums">{slotLabel(slot)}</span>
                    <Badge tone={KIND_TONES[slot.kind] ?? 'neutral'} size="sm">
                      {KIND_LABELS[slot.kind] ?? slot.kind}
                    </Badge>
                    <Badge tone={slot.status === 'missed' ? 'orange' : 'neutral'} size="sm">
                      {statusLabel(slot)}
                    </Badge>
                    <span className="text-ink-muted">
                      {slot.formationId === null ? 'Toutes formations' : slot.title}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </BaseCard>

      <BaseCard testId="planner-capacity" title="Capacité quotidienne cumulée">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Heures utilisées et restantes par jour</caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-border py-2 pr-3">
                Jour
              </th>
              <th scope="col" className="border-b border-border py-2 pr-3">
                Utilisé
              </th>
              <th scope="col" className="border-b border-border py-2 pr-3">
                Total
              </th>
              <th scope="col" className="border-b border-border py-2">
                Restant
              </th>
            </tr>
          </thead>
          <tbody>
            {result.remainingCapacity.map((capacity) => (
              <tr key={capacity.date} data-testid={`planner-capacity-${capacity.date}`}>
                <td className="border-b border-divider py-2 pr-3 tabular-nums">{capacity.date}</td>
                <td className="border-b border-divider py-2 pr-3 tabular-nums">
                  {hhmm(capacity.usedMinutes)}
                </td>
                <td className="border-b border-divider py-2 pr-3 tabular-nums">
                  {hhmm(capacity.totalMinutes)}
                </td>
                <td className="border-b border-divider py-2 tabular-nums">
                  {hhmm(capacity.remainingMinutes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div data-testid="planner-conflicts" className="mt-4 text-sm">
          {result.conflicts.length === 0 ? (
            <p data-testid="planner-conflicts-empty">Aucun conflit détecté.</p>
          ) : (
            <ul className="space-y-1">
              {result.conflicts.map((conflict) => (
                <li key={`${conflict.date}-${conflict.slotIds.join('-')}`}>
                  {`${conflict.date} · ${conflict.message}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      </BaseCard>

      <BaseCard testId="planner-options" title="Options de réajustement">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="dark"
            data-testid="planner-miss-session"
            onClick={simulateMissedSession}
          >
            Séance manquée
          </Button>
          <span className="text-sm text-ink-muted">
            {`Échéances manquées : ${String(result.deadlines.filter((deadline) => deadline.missed).length)}`}
          </span>
        </div>
        {result.options.length === 0 ? (
          <p data-testid="planner-options-empty" className="mt-4 text-sm">
            Échéance respectée : aucune option n’est proposée et le plan reste inchangé.
          </p>
        ) : (
          <ul data-testid="planner-options-list" className="mt-4 grid gap-3 sm:grid-cols-3">
            {result.options.map((option) => (
              <li
                key={`${option.formationId}-${option.kind}`}
                data-testid={`planner-option-${option.formationId}-${option.kind}`}
                className="rounded-18 border border-solid border-border bg-canvas p-4 text-sm"
              >
                <p className="font-600">{optionsLabel(option)}</p>
                <p className="mt-1 text-ink-muted">
                  {option.feasible
                    ? `Fin projetée : ${option.projectedEndDate ?? option.currentEndDate}`
                    : option.reason}
                </p>
                <p className="mt-1 text-ink-muted">
                  {`Volume actuel : ${String(option.currentHoursPerDay)} h/jour`}
                </p>
              </li>
            ))}
          </ul>
        )}
        {missedSlots.length > 0 ? (
          <p data-testid="planner-missed-history" className="mt-4 text-sm text-ink-muted">
            {`Historique conservé : ${String(missedSlots.length)} créneau(x) manqué(s), dont ${missedSlots
              .map((slot) => slot.slotId)
              .join(', ')}.`}
          </p>
        ) : null}
      </BaseCard>
    </>
  );
}
