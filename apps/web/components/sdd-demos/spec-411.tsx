import {
  loadSpec411Demo,
  type Spec411Data,
  type Spec411State,
} from '../../app/%5Fdev/sdd/spec-411-data';
import { BaseCard, BaseTokenStyle } from '../sdd/base-tokens';

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  dateStyle: 'short',
  timeStyle: 'short',
});

const numberFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

function instant(value: string | null): string {
  return value === null ? '—' : dateFormatter.format(new Date(value));
}

function mastery(value: number): string {
  return `${numberFormatter.format(value)} %`;
}

function gapLabel(state: Spec411State): string {
  if (state.gapNature === null) return 'Aucune lacune';
  return state.gapClearedAt === null
    ? `Lacune ${state.gapNature} active`
    : `Lacune ${state.gapNature} levée`;
}

function Summary({ data }: Readonly<{ data: Spec411Data }>) {
  return (
    <BaseCard testId="learning-summary" title="Transaction réelle">
      <p className="m-0 text-13 text-ink-secondary">
        Une tentative corrigée de deux notions est appliquée par le vrai service, dans une
        transaction <code>userDb</code> sous RLS. Le second appel ne réécrit rien.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-13">
        <dt>Statut de la tentative</dt>
        <dd className="m-0 font-mono" data-testid="learning-attempt-status">
          {data.attemptStatus} · {data.answerCount} réponses
        </dd>
        <dt>Premier appel</dt>
        <dd className="m-0 font-mono" data-testid="learning-review-count">
          {data.reviewCount} révision(s), {data.pendingAnswers} en attente
        </dd>
        <dt>Second appel (idempotence)</dt>
        <dd className="m-0 font-mono" data-testid="learning-second-call">
          {data.secondStatus} · {data.secondReviewCount} révision(s)
        </dd>
        <dt>Activité du jour</dt>
        <dd className="m-0 font-mono" data-testid="learning-daily">
          {data.dailyDay} · {data.dailyMinutes} min
        </dd>
        <dt>Plan persisté</dt>
        <dd className="m-0 font-mono" data-testid="learning-plan-summary">
          {data.slotSummary}
        </dd>
      </dl>
    </BaseCard>
  );
}

function States({ data }: Readonly<{ data: Spec411Data }>) {
  return (
    <BaseCard testId="learning-states" title="États avant / après">
      <div
        role="region"
        aria-label="États avant et après"
        tabIndex={0}
        className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <table className="w-full min-w-[44rem] text-left text-13">
          <thead>
            <tr>
              <th scope="col" className="px-3 py-2">
                Notion
              </th>
              <th scope="col" className="px-3 py-2">
                Maîtrise avant
              </th>
              <th scope="col" className="px-3 py-2">
                Maîtrise après
              </th>
              <th scope="col" className="px-3 py-2">
                Échéance après
              </th>
              <th scope="col" className="px-3 py-2">
                Lacune après
              </th>
            </tr>
          </thead>
          <tbody>
            {data.after.map((after) => {
              const before = data.before.find((state) => state.notionId === after.notionId);
              return (
                <tr
                  key={after.notionId}
                  data-testid="learning-state-row"
                  className="border-t border-border"
                >
                  <td className="px-3 py-2 font-semibold">{after.label}</td>
                  <td className="px-3 py-2 font-mono" data-testid="learning-before">
                    {mastery(before?.mastery ?? 0)}
                  </td>
                  <td className="px-3 py-2 font-mono" data-testid="learning-after">
                    {mastery(after.mastery)}
                  </td>
                  <td className="px-3 py-2 font-mono">{instant(after.dueAt)}</td>
                  <td className="px-3 py-2 font-mono" data-testid="learning-gap">
                    {gapLabel(after)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </BaseCard>
  );
}

function Events({ data }: Readonly<{ data: Spec411Data }>) {
  return (
    <BaseCard testId="learning-events" title="Événements après commit">
      <p className="m-0 text-13 text-ink-secondary">
        Les événements de domaine sont écrits dans l’outbox dans la même transaction, puis envoyés
        après le commit. Aucun événement n’est émis si la transaction est annulée.
      </p>
      {data.events.length === 0 ? (
        <p className="mt-3" data-testid="learning-events-empty">
          Aucun événement.
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-1 gap-2">
          {data.events.map((event) => (
            <li
              key={`${event.name}-${event.sentAt ?? ''}`}
              data-testid="learning-event"
              className="rounded-[8px] border border-solid border-border p-3 font-mono text-12"
            >
              {event.name}
              {event.nature === null ? '' : ` · nature ${event.nature}`} ·{' '}
              {event.sentAt === null ? 'en attente d’envoi' : `envoyé ${instant(event.sentAt)}`}
            </li>
          ))}
        </ul>
      )}
      <p className="m-0 mt-3 font-mono text-12" data-testid="learning-gap-events">
        {data.gapEvents.length} gap_event(s)
      </p>
    </BaseCard>
  );
}

function Slots({ data }: Readonly<{ data: Spec411Data }>) {
  return (
    <BaseCard testId="learning-slots" title="Créneaux du plan">
      <p className="m-0 text-13 text-ink-secondary">
        Les créneaux calculés par SPEC-407 sont rapprochés par <code>planner_key</code> : une
        replanification conserve les créneaux terminés et les déplacements manuels.
      </p>
      <ul className="mt-3 grid grid-cols-1 gap-2">
        {data.slots.map((slot) => (
          <li
            key={`${slot.title}-${slot.startsAt}`}
            data-testid="learning-slot"
            className="rounded-[8px] border border-solid border-border p-3 text-13"
          >
            <span className="font-semibold">{slot.title}</span> · {slot.kind} · {slot.status} ·{' '}
            {slot.createdBy} · {instant(slot.startsAt)} → {instant(slot.endsAt)}
          </li>
        ))}
      </ul>
    </BaseCard>
  );
}

export default async function Spec411Demo() {
  let data: Spec411Data;
  try {
    data = await loadSpec411Demo();
  } catch {
    return (
      <div className="mt-6">
        <p role="alert">Démonstration indisponible : base locale injoignable.</p>
      </div>
    );
  }
  return (
    <>
      <BaseTokenStyle />
      <p className="mt-6 text-13 text-ink-secondary">
        Démonstration : une tentative de validation corrigée sur deux notions, un premier appel
        transactionnel, un second appel idempotent, la lacune détectée et le plan persisté.
      </p>
      <Summary data={data} />
      <States data={data} />
      <Events data={data} />
      <Slots data={data} />
    </>
  );
}
