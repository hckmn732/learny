import { loadSpec115Demo, type Spec115Data } from '../../app/%5Fdev/sdd/spec-115-data';
import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

const t = fr.sdd.spec115;

function Missing() {
  return (
    <div className="mt-6">
      <p role="alert" data-testid="spec-115-missing">
        {t.missing}
      </p>
    </div>
  );
}

function Profile({ data }: Readonly<{ data: Spec115Data }>) {
  return (
    <DemoSection testId="spec-115-profile" title={t.profile.title}>
      {data.profile === null ? (
        <p data-testid="spec-115-profile-missing">{t.missing}</p>
      ) : (
        <div className="space-y-2">
          <p className="text-2xl font-semibold" data-testid="spec-115-profile-name">
            {data.profile.fullName}
          </p>
          <p className="text-sm" data-testid="spec-115-profile-email">
            {data.profile.email}
          </p>
          <p className="text-sm" data-testid="spec-115-profile-timezone">
            {t.profile.timezone(data.profile.timezone)}
          </p>
          <p className="text-sm" data-testid="spec-115-profile-streak">
            {t.profile.streak(data.profile.streakDays)}
          </p>
        </div>
      )}
    </DemoSection>
  );
}

function Formations({ data }: Readonly<{ data: Spec115Data }>) {
  return (
    <DemoSection testId="spec-115-formations" title={t.formations.title}>
      <p className="text-lg font-semibold" data-testid="spec-115-formations-summary">
        {t.formations.summary(data.formations.activeOrProposed, data.formations.completed)}
      </p>
      <ul aria-label={t.formations.list} className="mt-3 space-y-2">
        {data.formations.titles.map((formation) => (
          <li
            key={formation.title}
            data-testid="spec-115-formation"
            data-status={formation.status}
            className="flex items-center justify-between rounded-[8px] border border-solid border-[#E7E6E1] px-3 py-2"
          >
            <span>{formation.title}</span>
            <span className="font-mono text-sm">
              {t.formations.statuses[formation.status] ?? formation.status}
            </span>
          </li>
        ))}
      </ul>
    </DemoSection>
  );
}

function Sap({ data }: Readonly<{ data: Spec115Data }>) {
  return (
    <DemoSection testId="spec-115-sap" title={t.sap.title}>
      <p className="text-2xl font-semibold" data-testid="spec-115-sap-summary">
        {t.sap.summary(data.sap.modules, data.sap.notions)}
      </p>
      <p className="mt-2 text-sm" data-testid="spec-115-sap-chapters">
        {t.sap.chapters(data.sap.chapters)}
      </p>
    </DemoSection>
  );
}

function Group({ data }: Readonly<{ data: Spec115Data }>) {
  return (
    <DemoSection testId="spec-115-group" title={t.group.title}>
      <p className="text-2xl font-semibold" data-testid="spec-115-group-summary">
        {t.group.summary(data.group.members)}
      </p>
      <p className="mt-2 text-sm" data-testid="spec-115-group-names">
        {t.group.names(data.group.names.join(', '))}
      </p>
    </DemoSection>
  );
}

function Agenda({ data }: Readonly<{ data: Spec115Data }>) {
  return (
    <DemoSection testId="spec-115-agenda" title={t.agenda.title}>
      <ol aria-label={t.agenda.list} className="space-y-2">
        {data.agenda.days.map((day) => (
          <li
            key={day.date}
            data-testid="spec-115-agenda-day"
            data-date={day.date}
            data-slots={day.slots.length}
            className="rounded-[8px] border border-solid border-[#E7E6E1] px-3 py-2"
          >
            <p className="font-medium">
              {day.label} · {t.agenda.slotCount(day.slots.length)}
            </p>
            <ul className="mt-1 space-y-1">
              {day.slots.map((slot) => (
                <li
                  key={slot.id}
                  data-testid="spec-115-agenda-slot"
                  data-status={slot.status}
                  className="text-sm"
                >
                  {`${slot.start}–${slot.end} · ${slot.title}`}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm" data-testid="spec-115-agenda-summary">
        {t.agenda.summary(data.agenda.slots)}
      </p>
    </DemoSection>
  );
}

function Checks({ data }: Readonly<{ data: Spec115Data }>) {
  return (
    <DemoSection testId="spec-115-checks" title={t.checks.title}>
      <p className="mb-3 text-sm">{t.checks.intro}</p>
      <div
        role="region"
        aria-label={t.checks.title}
        tabIndex={0}
        className="overflow-x-auto rounded-[8px] border border-solid border-[#E7E6E1]"
      >
        <table className="w-full min-w-[36rem] text-left">
          <thead>
            <tr>
              <th scope="col" className="px-3 py-2">
                {t.checks.label}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.checks.expected}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.checks.observed}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.checks.status}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.checks.source}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.checks.map((entry) => (
              <tr
                key={entry.key}
                data-testid="spec-115-check"
                data-key={entry.key}
                data-ok={entry.ok ? 'true' : 'false'}
                className="border-t border-[#E7E6E1]"
              >
                <th scope="row" className="px-3 py-2 font-medium">
                  {entry.label}
                </th>
                <td className="px-3 py-2 font-mono">{entry.expected}</td>
                <td className="px-3 py-2 font-mono">{entry.observed}</td>
                <td className="px-3 py-2">{entry.ok ? t.checks.ok : t.checks.ko}</td>
                <td className="px-3 py-2 text-sm">
                  {`${entry.source.screen} · ${entry.source.file}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DemoSection>
  );
}

export default async function Spec115Demo() {
  let data: Spec115Data;
  try {
    data = await loadSpec115Demo();
  } catch {
    return <Missing />;
  }
  if (!data.present) return <Missing />;

  return (
    <>
      <p className="mt-6 text-sm">{t.intro}</p>
      <Profile data={data} />
      <Formations data={data} />
      <Sap data={data} />
      <Group data={data} />
      <Agenda data={data} />
      <Checks data={data} />
    </>
  );
}
