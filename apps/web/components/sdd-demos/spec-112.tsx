import { sanitizeSnippet } from '@learny/db';

import { loadSpec112Demo, type Spec112Data } from '../../app/%5Fdev/sdd/spec-112-data';
import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

const t = fr.sdd.spec112;

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  dateStyle: 'short',
  timeStyle: 'short',
});

const sizeFormatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function instant(value: string): string {
  return dateFormatter.format(new Date(value));
}

function size(value: number | null): string {
  if (value === null) return t.export.missing;
  return `${sizeFormatter.format(value / 1_000_000)} Mo`;
}

function Search({ data }: Readonly<{ data: Spec112Data }>) {
  return (
    <DemoSection testId="spec-112-search" title={t.search.title}>
      <p className="mb-3 text-sm">{t.search.intro}</p>
      <div className="mb-4">
        <label htmlFor="spec-112-query" className="block text-sm font-semibold">
          {t.search.label}
        </label>
        <input
          id="spec-112-query"
          name="q"
          type="search"
          defaultValue={data.query}
          aria-describedby="spec-112-query-help"
          className="mt-2 w-full max-w-md rounded-[8px] border border-solid border-[#E7E6E1] px-3 py-2"
        />
        <p id="spec-112-query-help" className="mt-2 text-sm">
          {t.search.help}
        </p>
      </div>
      <p role="status" className="mb-3 text-sm font-semibold" data-testid="spec-112-result-count">
        {t.search.count(data.total)}
      </p>
      <div data-testid="spec-112-results" className="space-y-4">
        {data.groups.length === 0 ? (
          <p role="status" className="text-sm" data-testid="spec-112-no-match">
            {t.search.noMatch}
          </p>
        ) : (
          data.groups.map((group) => (
            <section key={group.kind} data-testid="spec-112-group" data-kind={group.kind}>
              <h3 className="text-lg font-semibold">{t.search.groups[group.kind]}</h3>
              <ul className="mt-2 space-y-3">
                {group.items.map((item) => (
                  <li
                    key={item.id}
                    data-testid="spec-112-result"
                    data-kind={item.kind}
                    className="rounded-[8px] border border-solid border-[#E7E6E1] p-3"
                  >
                    <a
                      href={item.href}
                      data-testid="spec-112-result-title"
                      className="font-semibold underline"
                    >
                      {item.title}
                    </a>
                    <p className="mt-1 text-sm" data-testid="spec-112-result-snippet">
                      {sanitizeSnippet(item.snippet)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
      <p className="mt-4 text-sm" data-testid="spec-112-isolation">
        {t.search.isolation(data.foreignTitle, data.foreignVisible)}
      </p>
    </DemoSection>
  );
}

function Exports({ data }: Readonly<{ data: Spec112Data }>) {
  return (
    <DemoSection testId="spec-112-export" title={t.export.title}>
      <p className="mb-3 text-sm">{t.export.intro}</p>
      <div
        role="region"
        aria-label={t.export.region}
        tabIndex={0}
        className="overflow-x-auto rounded-[8px] border border-solid border-[#E7E6E1]"
      >
        <table className="w-full min-w-[36rem] text-left">
          <thead>
            <tr>
              <th scope="col" className="px-3 py-2">
                {t.export.export}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.export.status}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.export.size}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.export.created}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.export.expires}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.export.availability}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.exports.map((row) => {
              const state =
                row.status === 'done'
                  ? row.downloadable
                    ? t.export.downloadable
                    : t.export.expired
                  : t.export.states[row.status as keyof typeof t.export.states];
              return (
                <tr
                  key={row.id}
                  data-testid="spec-112-export-row"
                  className="border-t border-[#E7E6E1]"
                >
                  <td className="px-3 py-2 font-mono text-xs">{row.id}</td>
                  <td className="px-3 py-2" data-testid="spec-112-export-state">
                    {state}
                  </td>
                  <td className="px-3 py-2 font-mono text-sm">{size(row.sizeBytes)}</td>
                  <td className="px-3 py-2 font-mono text-sm">{instant(row.createdAt)}</td>
                  <td className="px-3 py-2 font-mono text-sm">
                    {row.expiresAt === null ? t.export.missing : instant(row.expiresAt)}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {row.downloadable ? t.export.link : t.export.noLink}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm">{t.export.note}</p>
    </DemoSection>
  );
}

function Acceptances({ data }: Readonly<{ data: Spec112Data }>) {
  return (
    <DemoSection testId="spec-112-acceptance" title={t.acceptance.title}>
      <p className="mb-3 text-sm">{t.acceptance.intro}</p>
      <div
        role="region"
        aria-label={t.acceptance.region}
        tabIndex={0}
        className="overflow-x-auto rounded-[8px] border border-solid border-[#E7E6E1]"
      >
        <table className="w-full min-w-[28rem] text-left">
          <thead>
            <tr>
              <th scope="col" className="px-3 py-2">
                {t.acceptance.document}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.acceptance.version}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.acceptance.acceptedAt}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.acceptances.map((row) => (
              <tr
                key={row.id}
                data-testid="spec-112-acceptance-row"
                className="border-t border-[#E7E6E1]"
              >
                <td className="px-3 py-2" data-testid="spec-112-acceptance-document">
                  {t.acceptance.documents[row.document]}
                </td>
                <td
                  className="px-3 py-2 font-mono text-sm"
                  data-testid="spec-112-acceptance-version"
                >
                  {row.version}
                </td>
                <td className="px-3 py-2 font-mono text-sm">{instant(row.acceptedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm" data-testid="spec-112-latest-cgu">
        {t.acceptance.latest(data.latestCgu ?? t.acceptance.missing)}
      </p>
    </DemoSection>
  );
}

function Idempotency({ data }: Readonly<{ data: Spec112Data }>) {
  return (
    <DemoSection testId="spec-112-idempotency" title={t.idempotency.title}>
      <p className="mb-3 text-sm">{t.idempotency.intro}</p>
      <div
        role="region"
        aria-label={t.idempotency.region}
        tabIndex={0}
        className="overflow-x-auto rounded-[8px] border border-solid border-[#E7E6E1]"
      >
        <table className="w-full min-w-[40rem] text-left">
          <thead>
            <tr>
              <th scope="col" className="px-3 py-2">
                {t.idempotency.key}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.idempotency.state}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.idempotency.status}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.idempotency.created}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.idempotency.completed}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.idempotency.map((row) => (
              <tr
                key={row.key}
                data-testid="spec-112-idempotency-row"
                data-state={row.state}
                className="border-t border-[#E7E6E1]"
              >
                <td className="px-3 py-2 font-mono text-sm">{row.key}</td>
                <td className="px-3 py-2" data-testid="spec-112-idempotency-state">
                  {t.idempotency.states[row.state]}
                </td>
                <td className="px-3 py-2 font-mono text-sm">{row.statusCode}</td>
                <td className="px-3 py-2 font-mono text-sm">{instant(row.createdAt)}</td>
                <td className="px-3 py-2 font-mono text-sm">
                  {row.completedAt === null ? t.idempotency.missing : instant(row.completedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm">{t.idempotency.note}</p>
    </DemoSection>
  );
}

export default async function Spec112Demo() {
  let data: Spec112Data;
  try {
    data = await loadSpec112Demo();
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
      <Search data={data} />
      <Exports data={data} />
      <Acceptances data={data} />
      <Idempotency data={data} />
    </>
  );
}
