import { loadSpec108Demo, type Spec108Data } from '../../app/%5Fdev/sdd/spec-108-data';
import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

const t = fr.sdd.spec108;

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  dateStyle: 'short',
  timeStyle: 'short',
});

const dayFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  dateStyle: 'short',
});

function instant(value: string): string {
  return dateFormatter.format(new Date(value));
}

function civilDay(value: string): string {
  return dayFormatter.format(new Date(`${value}T12:00:00Z`));
}

/** Looks up a French label by an enum value, falling back to the raw value. */
function label(labels: Record<string, string>, key: string): string {
  return labels[key] ?? key;
}

function Slots({ data }: Readonly<{ data: Spec108Data }>) {
  return (
    <DemoSection testId="spec-108-slots" title={t.slots.title}>
      <p className="mb-3 text-sm">{t.slots.intro}</p>
      <p className="text-sm font-semibold">{t.slots.legend}</p>
      <ul className="mt-2 flex flex-wrap gap-2" aria-label={t.slots.legend}>
        {Object.entries(t.slots.statuses).map(([status, label]) => {
          const used = data.slots.some((slot) => slot.status === status);
          return (
            <li
              key={status}
              data-testid="slot-status-legend"
              data-status={status}
              data-used={used ? 'true' : 'false'}
              className="rounded-[8px] border border-solid border-border px-3 py-1 text-sm"
            >
              {label}
            </li>
          );
        })}
      </ul>
      <div
        role="region"
        aria-label={t.slots.region}
        tabIndex={0}
        className="mt-4 overflow-x-auto rounded-[8px] border border-solid border-border"
      >
        <table className="w-full min-w-[48rem] text-left">
          <thead>
            <tr>
              <th scope="col" className="px-3 py-2">
                {t.slots.slot}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.slots.kind}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.slots.status}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.slots.start}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.slots.end}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.slots.creator}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.slots.origin}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.slots.map((slot) => (
              <tr
                key={slot.id}
                data-testid="slot-row"
                data-status={slot.status}
                className="border-t border-border"
              >
                <td className="px-3 py-2" data-testid="slot-title">
                  {slot.title}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="slot-kind">
                  {t.slots.kinds[slot.kind]}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="slot-status">
                  {t.slots.statuses[slot.status]}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="slot-start">
                  {instant(slot.startsAt)}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="slot-end">
                  {instant(slot.endsAt)}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="slot-creator">
                  {t.slots.creators[slot.createdBy]}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="slot-origin">
                  {slot.movedFromStartsAt === null
                    ? t.slots.noOrigin
                    : t.slots.movedFrom(instant(slot.movedFromStartsAt))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DemoSection>
  );
}

function Action({ data }: Readonly<{ data: Spec108Data }>) {
  const action = data.action;
  return (
    <DemoSection testId="spec-108-action" title={t.action.title}>
      <p className="mb-3 text-sm">{t.action.intro}</p>
      {action === null ? (
        <p className="text-sm">{t.action.automatic}</p>
      ) : (
        <>
          <p className="font-semibold" data-testid="action-summary">
            {action.summary}
          </p>
          <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <dt>{t.action.automation}</dt>
            <dd className="font-mono" data-testid="action-automation">
              {label(t.action.automations, action.automation)}
            </dd>
            <dt>{t.action.kind}</dt>
            <dd className="font-mono" data-testid="action-kind">
              {action.kind}
            </dd>
            <dt>{t.action.status}</dt>
            <dd className="font-mono" data-testid="action-status">
              {t.action.statuses[action.status]}
            </dd>
            <dt>{t.action.consent}</dt>
            <dd className="font-mono" data-testid="action-consent">
              {action.requiresConsent ? t.action.requiresConsent : t.action.automatic}
            </dd>
            <dt>{t.action.createdAt}</dt>
            <dd className="font-mono" data-testid="action-created-at">
              {instant(action.createdAt)}
            </dd>
          </dl>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm">{t.action.payload}</summary>
            <pre
              data-testid="action-payload"
              className="mt-2 overflow-x-auto rounded-[8px] border border-solid border-border p-3 text-xs"
            >
              {JSON.stringify(action.payload, null, 2)}
            </pre>
          </details>
        </>
      )}
    </DemoSection>
  );
}

function Daily({ data }: Readonly<{ data: Spec108Data }>) {
  const daily = data.daily;
  return (
    <DemoSection testId="spec-108-daily" title={t.daily.title}>
      <p className="mb-3 text-sm">{t.daily.intro}</p>
      {daily === null ? (
        <p className="text-sm">—</p>
      ) : (
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <dt>{t.daily.day}</dt>
          <dd className="font-mono" data-testid="daily-day">
            {civilDay(daily.day)}
          </dd>
          <dt>{t.daily.minutes}</dt>
          <dd className="font-mono" data-testid="daily-minutes">
            {`${String(daily.minutes)} min`}
          </dd>
          <dt>{t.daily.qualifying}</dt>
          <dd className="font-mono" data-testid="daily-qualifying">
            {daily.qualifying ? t.daily.yes : t.daily.no}
          </dd>
          <dt>{t.daily.sources}</dt>
          <dd className="font-mono" data-testid="daily-sources">
            {daily.sources.join(' · ')}
          </dd>
        </dl>
      )}
    </DemoSection>
  );
}

function Milestones({ data }: Readonly<{ data: Spec108Data }>) {
  return (
    <DemoSection testId="spec-108-milestones" title={t.milestones.title}>
      <p className="mb-3 text-sm">{t.milestones.intro}</p>
      <div
        role="region"
        aria-label={t.milestones.region}
        tabIndex={0}
        className="overflow-x-auto rounded-[8px] border border-solid border-border"
      >
        <table className="w-full min-w-[36rem] text-left">
          <thead>
            <tr>
              <th scope="col" className="px-3 py-2">
                {t.milestones.key}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.milestones.reference}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.milestones.achievedAt}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.milestones.map((milestone) => (
              <tr
                key={`${milestone.key}-${milestone.refId ?? 'none'}`}
                data-testid="milestone-row"
                className="border-t border-border"
              >
                <td className="px-3 py-2 font-mono text-sm" data-testid="milestone-key">
                  {label(t.milestones.keys, milestone.key)}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="milestone-reference">
                  {milestone.refId === null ? t.milestones.noReference : milestone.refId}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="milestone-achieved">
                  {instant(milestone.achievedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DemoSection>
  );
}

export default async function Spec108Demo() {
  let data: Spec108Data;
  try {
    data = await loadSpec108Demo();
  } catch {
    return (
      <div className="mt-6">
        <p role="alert">{fr.sdd.spec101.unavailable}</p>
      </div>
    );
  }

  return (
    <>
      <p className="mt-6 text-sm">{t.intro}</p>
      <Slots data={data} />
      <Action data={data} />
      <Daily data={data} />
      <Milestones data={data} />
    </>
  );
}
