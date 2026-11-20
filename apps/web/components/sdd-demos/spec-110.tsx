import { loadSpec110Demo, type Spec110Data } from '../../app/%5Fdev/sdd/spec-110-data';
import { fr } from '../../messages/fr/sdd';
import { DemoSection } from '../sdd/demo-shell';

const t = fr.sdd.spec110;

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  dateStyle: 'short',
});

function instant(value: string | null): string {
  return value === null ? t.subscription.noPeriod : dateFormatter.format(new Date(value));
}

function Credentials({ data }: Readonly<{ data: Spec110Data }>) {
  return (
    <DemoSection testId="spec-110-credentials" title={t.credentials.title}>
      <p className="mb-3 text-sm">{t.credentials.intro}</p>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {data.credentials.map((credential) => (
          <li
            key={`${credential.provider}-${credential.label}`}
            data-testid="credential-card"
            className="rounded-[8px] border border-solid border-border p-4"
          >
            <p className="font-semibold" data-testid="credential-label">
              {credential.label}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <dt>{t.credentials.provider}</dt>
              <dd className="font-mono" data-testid="credential-provider">
                {t.credentials.providers[credential.provider]}
              </dd>
              <dt>{t.credentials.last4}</dt>
              <dd className="font-mono" data-testid="credential-last4">
                {credential.keyLast4 === null ? t.credentials.noKey : `•••• ${credential.keyLast4}`}
              </dd>
              <dt>{t.credentials.status}</dt>
              <dd className="font-mono" data-testid="credential-status">
                {t.credentials.statuses[credential.status]}
              </dd>
              <dt>{t.credentials.region}</dt>
              <dd className="font-mono" data-testid="credential-region">
                {credential.outsideEu ? t.credentials.outsideEu : t.credentials.eu}
              </dd>
            </dl>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm">{t.credentials.secretNote}</p>
    </DemoSection>
  );
}

function Tasks({ data }: Readonly<{ data: Spec110Data }>) {
  return (
    <DemoSection testId="spec-110-tasks" title={t.tasks.title}>
      <p className="mb-3 text-sm">{t.tasks.intro}</p>
      <div
        role="region"
        aria-label={t.tasks.region}
        tabIndex={0}
        className="overflow-x-auto rounded-[8px] border border-solid border-border"
      >
        <table className="w-full min-w-[40rem] text-left">
          <thead>
            <tr>
              <th scope="col" className="px-3 py-2">
                {t.tasks.task}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.tasks.model}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.tasks.source}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.tasks.map((task) => {
              const source =
                task.credentialLabel === null
                  ? t.tasks.none
                  : task.usable
                    ? t.tasks.personal(task.credentialLabel)
                    : t.tasks.fallback(task.credentialLabel);
              return (
                <tr key={task.task} data-testid="task-row" className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-sm" data-testid="task-name">
                    {t.tasks.tasks[task.task as keyof typeof t.tasks.tasks]}
                  </td>
                  <td className="px-3 py-2 font-mono text-sm" data-testid="task-model">
                    {task.modelId ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-sm" data-testid="task-source">
                    {source}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </DemoSection>
  );
}

function Subscription({ data }: Readonly<{ data: Spec110Data }>) {
  return (
    <DemoSection testId="spec-110-subscription" title={t.subscription.title}>
      <p className="mb-3 text-sm">{t.subscription.intro}</p>
      {data.subscription === null ? (
        <p className="text-sm">{t.subscription.none}</p>
      ) : (
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <dt>{t.subscription.status}</dt>
          <dd className="font-mono" data-testid="subscription-status">
            {t.subscription.statuses[data.subscription.status]}
          </dd>
          <dt>{t.subscription.periodEnd}</dt>
          <dd className="font-mono" data-testid="subscription-period-end">
            {instant(data.subscription.currentPeriodEnd)}
          </dd>
        </dl>
      )}
      <p className="mt-3 text-sm" data-testid="subscription-note">
        {t.subscription.note}
      </p>
    </DemoSection>
  );
}

export default function Spec110Demo() {
  let data: Spec110Data;
  try {
    data = loadSpec110Demo();
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
      <Credentials data={data} />
      <Tasks data={data} />
      <Subscription data={data} />
    </>
  );
}
