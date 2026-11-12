import { cleanupDemoUser, createDemoUser } from '../../app/%5Fdev/sdd/spec-102-actions';
import { loadSpec102Demo, type Spec102Data } from '../../app/%5Fdev/sdd/spec-102-data';
import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

const t = fr.sdd.spec102;

function Badge({ testId, ok }: Readonly<{ testId: string; ok: boolean }>) {
  return (
    <span
      data-testid={testId}
      className={`inline-block rounded-full px-2 py-0.5 text-sm whitespace-nowrap ${
        ok ? 'bg-green-soft text-green-ink' : 'bg-orange-soft text-danger'
      }`}
    >
      {ok ? t.constraints.refused : t.constraints.unexpected}
    </span>
  );
}

function formatDays(days: number[]): string {
  const sorted = [...new Set(days)].sort((left, right) => left - right);
  const first = sorted[0];
  const last = sorted.at(-1);
  if (first === undefined || last === undefined) return '—';
  const contiguous = sorted.every(
    (day, index) => index === 0 || day === (sorted[index - 1] ?? 0) + 1,
  );
  if (sorted.length > 1 && contiguous) {
    const weekdays: readonly string[] = t.study.weekdays;
    return t.study.range(weekdays[first - 1] ?? String(first), weekdays[last - 1] ?? String(last));
  }
  const weekdays: readonly string[] = t.study.weekdays;
  return sorted.map((day) => weekdays[day - 1] ?? String(day)).join(', ');
}

function Controls({ data }: Readonly<{ data: Spec102Data | null }>) {
  if (data === null) {
    return (
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <form action={createDemoUser}>
          <button
            type="submit"
            data-testid="create-demo-user"
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white"
          >
            {t.create}
          </button>
        </form>
        <p className="text-sm">{t.emptyIntro}</p>
      </div>
    );
  }
  return (
    <div className="mt-6 flex flex-wrap items-center gap-4">
      <p className="text-sm" data-testid="demo-user">
        {`${t.demoUser} : ${data.email}`}
      </p>
      <form action={cleanupDemoUser}>
        <button
          type="submit"
          data-testid="cleanup"
          className="rounded-full border border-solid border-border px-4 py-2 text-sm font-medium"
        >
          {t.cleanup}
        </button>
      </form>
    </div>
  );
}

export default async function Spec102Demo() {
  let data: Spec102Data | null;
  try {
    data = await loadSpec102Demo();
  } catch {
    return (
      <div className="mt-6">
        <p role="alert">{fr.sdd.spec101.unavailable}</p>
      </div>
    );
  }

  return (
    <>
      <Controls data={data} />
      {data === null ? (
        <p className="mt-6 text-sm" data-testid="identity-empty">
          {t.emptyCard}
        </p>
      ) : (
        <>
          <DemoSection testId="profile-card" title={t.profile.title}>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <dt>{t.profile.email}</dt>
              <dd data-testid="profile-email" className="font-mono">
                {data.profile.email}
              </dd>
              <dt>{t.profile.language}</dt>
              <dd data-testid="profile-language" className="font-mono">
                {data.profile.courseLanguage}
              </dd>
              <dt>{t.profile.tone}</dt>
              <dd data-testid="profile-tone" className="font-mono">
                {data.profile.tutorTone}
              </dd>
              <dt>{t.profile.timezone}</dt>
              <dd data-testid="profile-timezone" className="font-mono">
                {data.profile.timezone}
              </dd>
              <dt>{t.profile.step}</dt>
              <dd data-testid="profile-step" className="font-mono">
                {data.profile.onboardingStep}
              </dd>
            </dl>
          </DemoSection>

          <DemoSection testId="study-card" title={t.study.title}>
            <p data-testid="study-line" className="font-medium">
              {t.study.line(
                data.study.hoursPerDay,
                formatDays(data.study.studyDays),
                data.study.preferredSlots
                  .map((slot) => t.study.slotLabels[slot as keyof typeof t.study.slotLabels])
                  .join(', '),
              )}
            </p>
            <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <dt>{t.study.hours}</dt>
              <dd data-testid="study-hours">{data.study.hoursPerDay}</dd>
              <dt>{t.study.days}</dt>
              <dd data-testid="study-days">{data.study.studyDays.join(', ')}</dd>
              <dt>{t.study.slots}</dt>
              <dd data-testid="study-slots">{data.study.preferredSlots.join(', ')}</dd>
            </dl>
          </DemoSection>

          <DemoSection testId="notif-card" title={t.notifications.title}>
            <p className="text-sm" data-testid="notif-channels">
              {`${t.notifications.channels} : ${t.notifications.email} ${t.notifications.enabled} · ${t.notifications.push} ${t.notifications.enabled}`}
            </p>
            <ul className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {Object.entries(data.notifications.types).map(([key, enabled]) => (
                <li key={key} data-testid="notif-type">
                  {`${t.notifications.typeLabels[key as keyof typeof t.notifications.typeLabels]} : ${enabled ? t.notifications.enabled : t.notifications.disabled}`}
                </li>
              ))}
            </ul>
            <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <dt>{t.notifications.digest}</dt>
              <dd data-testid="notif-digest">{data.notifications.digestTime}</dd>
              <dt>{t.notifications.quiet}</dt>
              <dd data-testid="notif-quiet">
                {t.notifications.quietRange(
                  data.notifications.quietStart,
                  data.notifications.quietEnd,
                )}
              </dd>
              <dt>{t.notifications.weekend}</dt>
              <dd data-testid="notif-weekend">
                {data.notifications.weekendQuiet
                  ? t.notifications.enabled
                  : t.notifications.disabled}
              </dd>
              <dt>{t.notifications.cap}</dt>
              <dd data-testid="notif-cap">
                {t.notifications.capValue(data.notifications.maxPerDay)}
              </dd>
            </dl>
          </DemoSection>

          <DemoSection testId="automation-table" title={t.automations.title}>
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th scope="col" className="py-2 pr-4">
                    {t.automations.key}
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    {t.automations.enabled}
                  </th>
                  <th scope="col" className="py-2">
                    {t.automations.params}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.automations.map((automation) => (
                  <tr key={automation.key} data-testid="automation-row">
                    <td className="py-2 pr-4 font-mono">{automation.key}</td>
                    <td className="py-2 pr-4" data-testid="automation-enabled">
                      {automation.enabled
                        ? t.automations.enabledValue
                        : t.automations.disabledValue}
                    </td>
                    <td className="py-2 font-mono break-all" data-testid="automation-params">
                      {JSON.stringify(automation.params)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DemoSection>

          <DemoSection testId="constraints-card" title={t.constraints.title}>
            <p className="mb-3 text-sm">{t.constraints.intro}</p>
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th scope="col" className="py-2 pr-4">
                    {t.constraints.name}
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    {t.constraints.sqlstate}
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    {t.constraints.expected}
                  </th>
                  <th scope="col" className="py-2">
                    {t.constraints.result}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.constraints.map((constraint) => (
                  <tr key={constraint.key} data-testid="constraint-row">
                    <td className="py-2 pr-4">{t.constraints.cases[constraint.key]}</td>
                    <td className="py-2 pr-4 font-mono" data-testid="constraint-sqlstate">
                      {constraint.sqlstate}
                    </td>
                    <td className="py-2 pr-4 font-mono">{constraint.expected}</td>
                    <td className="py-2">
                      <Badge testId="constraint-result" ok={constraint.ok} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DemoSection>
        </>
      )}
    </>
  );
}
