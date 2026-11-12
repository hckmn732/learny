import { loadSpec104Demo, type Spec104Data } from '../../app/%5Fdev/sdd/spec-104-data';
import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

const t = fr.sdd.spec104;

function Badge({ testId, ok, label }: Readonly<{ testId: string; ok: boolean; label: string }>) {
  return (
    <span
      data-testid={testId}
      className={`inline-block rounded-full px-2 py-0.5 text-sm whitespace-nowrap ${
        ok ? 'bg-green-soft text-green-ink' : 'bg-orange-soft text-danger'
      }`}
    >
      {label}
    </span>
  );
}

function Resource({ data }: Readonly<{ data: Spec104Data }>) {
  const resource = data.resource;
  return (
    <DemoSection testId="resource-card" title={t.resource.title}>
      <p className="text-sm">
        {t.resource.kind(resource.kind, resource.status, resource.chunks.length)}
      </p>
      <blockquote className="mt-3 border-l-4 border-solid border-border pl-4">
        <p data-testid="resource-content">{resource.contentText}</p>
      </blockquote>
      <table className="mt-4 w-full text-left">
        <thead>
          <tr>
            <th scope="col" className="py-2 pr-4">
              {t.resource.position}
            </th>
            <th scope="col" className="py-2 pr-4">
              {t.resource.text}
            </th>
            <th scope="col" className="py-2">
              {t.resource.location}
            </th>
          </tr>
        </thead>
        <tbody>
          {resource.chunks.map((chunk) => (
            <tr key={`chunk-${String(chunk.position)}`} data-testid="chunk-row">
              <td className="py-2 pr-4 font-mono" data-testid="chunk-position">
                {chunk.position}
              </td>
              <td className="py-2 pr-4">{chunk.text}</td>
              <td className="py-2 font-mono" data-testid="chunk-location">
                {t.resource.range(chunk.charStart, chunk.charEnd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DemoSection>
  );
}

function VectorSearch({ data }: Readonly<{ data: Spec104Data }>) {
  const search = data.search;
  return (
    <DemoSection testId="vector-search" title={t.search.title}>
      <p className="mb-3 text-sm">{t.search.intro}</p>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <dt>{t.search.queryLabel}</dt>
        <dd data-testid="vector-query" className="font-mono">
          {search.query}
        </dd>
        <dt>{t.search.indexUsed}</dt>
        <dd>
          <Badge
            testId="vector-index"
            ok={search.indexUsed}
            label={search.indexUsed ? t.search.yes : t.search.no}
          />
        </dd>
      </dl>
      <ol className="mt-4 space-y-2" data-testid="neighbour-list">
        {search.neighbours.map((neighbour) => (
          <li
            key={`neighbour-${String(neighbour.position)}`}
            data-testid="neighbour-row"
            className="flex flex-col gap-1 rounded-[8px] bg-surface-subtle p-3 sm:flex-row sm:items-baseline sm:gap-3"
          >
            <span data-testid="neighbour-distance" className="font-mono">
              {neighbour.distance.toFixed(4)}
            </span>
            <span className="text-sm">{neighbour.text}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm">{t.search.planLabel}</p>
      <pre
        data-testid="vector-plan"
        className="mt-2 rounded-[8px] bg-surface-subtle p-3 text-xs break-all whitespace-pre-wrap"
      >
        {search.plan}
      </pre>
    </DemoSection>
  );
}

function Limits({ data }: Readonly<{ data: Spec104Data }>) {
  return (
    <DemoSection testId="limits-card" title={t.limits.title}>
      <p className="mb-3 text-sm">{t.limits.intro}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th scope="col" className="py-2 pr-4">
                {t.limits.name}
              </th>
              <th scope="col" className="py-2 pr-4">
                {t.limits.sqlstate}
              </th>
              <th scope="col" className="py-2 pr-4">
                {t.limits.code}
              </th>
              <th scope="col" className="py-2">
                {t.limits.result}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.limits.map((limit) => (
              <tr key={limit.key} data-testid="limit-row">
                <td className="py-2 pr-4">{t.limits.cases[limit.key]}</td>
                <td className="py-2 pr-4 font-mono" data-testid="limit-sqlstate">
                  {limit.sqlstate}
                </td>
                <td className="py-2 pr-4 font-mono" data-testid="limit-code">
                  {limit.code}
                </td>
                <td className="py-2">
                  <Badge
                    testId="limit-result"
                    ok={limit.ok}
                    label={limit.ok ? t.limits.refused : t.limits.unexpected}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DemoSection>
  );
}

function SoftDelete({ data }: Readonly<{ data: Spec104Data }>) {
  const softDelete = data.softDelete;
  return (
    <DemoSection testId="soft-delete-card" title={t.softDelete.title}>
      <p className="mb-3 text-sm">{t.softDelete.intro}</p>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <dt>{t.softDelete.before}</dt>
        <dd data-testid="soft-delete-before" className="font-mono">
          {t.softDelete.passages(softDelete.before)}
        </dd>
        <dt>{t.softDelete.after}</dt>
        <dd data-testid="soft-delete-after" className="font-mono">
          {t.softDelete.passages(softDelete.after)}
        </dd>
        <dt>{t.softDelete.retained}</dt>
        <dd data-testid="soft-delete-retained">
          {softDelete.retained ? t.softDelete.yes : t.softDelete.no}
        </dd>
        <dt>{t.softDelete.content}</dt>
        <dd data-testid="soft-delete-content">
          {softDelete.contentErased ? t.softDelete.erased : t.softDelete.kept}
        </dd>
        <dt>{t.softDelete.titleLabel}</dt>
        <dd data-testid="soft-delete-title">{softDelete.title}</dd>
      </dl>
    </DemoSection>
  );
}

export default async function Spec104Demo() {
  let data: Spec104Data;
  try {
    data = await loadSpec104Demo();
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
      <Resource data={data} />
      <VectorSearch data={data} />
      <Limits data={data} />
      <SoftDelete data={data} />
    </>
  );
}
