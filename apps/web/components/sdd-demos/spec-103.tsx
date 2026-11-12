import { loadSpec103Demo, type Spec103Data } from '../../app/%5Fdev/sdd/spec-103-data';
import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

const t = fr.sdd.spec103;

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

function Programme({ data }: Readonly<{ data: Spec103Data }>) {
  return (
    <DemoSection testId="programme-tree" title={t.programme.title}>
      {data.modules.length === 0 ? (
        <p>{t.programme.empty}</p>
      ) : (
        <ol className="space-y-4">
          {data.modules.map((module) => (
            <li key={`module-${String(module.position)}`} data-testid="programme-module">
              <p className="font-medium">
                {t.programme.module(module.position, module.title, module.threshold)}
              </p>
              <ol className="mt-2 space-y-2 pl-6">
                {module.chapters.map((chapter) => (
                  <li
                    key={`chapter-${String(module.position)}-${String(chapter.position)}`}
                    data-testid="programme-chapter"
                  >
                    <p>{t.programme.chapter(chapter.title)}</p>
                    <ol className="mt-1 space-y-1 pl-6">
                      {chapter.notions.map((notion) => (
                        <li
                          key={`notion-${String(module.position)}-${String(chapter.position)}-${String(notion.position)}`}
                          data-testid="programme-notion"
                        >
                          {t.programme.notion(notion.label)}
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </DemoSection>
  );
}

function Constraints({ data }: Readonly<{ data: Spec103Data }>) {
  return (
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
              <td className="py-2 pr-4">
                {constraint.key === 'cl3'
                  ? t.constraints.accepted
                  : t.constraints.cases[constraint.key]}
              </td>
              <td className="py-2 pr-4 font-mono" data-testid="constraint-sqlstate">
                {constraint.sqlstate}
              </td>
              <td className="py-2 pr-4 font-mono">{constraint.expected}</td>
              <td className="py-2">
                <Badge
                  testId="constraint-result"
                  ok={constraint.ok}
                  label={
                    constraint.key === 'cl3'
                      ? t.constraints.accepted
                      : constraint.ok
                        ? t.constraints.refused
                        : t.constraints.unexpected
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DemoSection>
  );
}

function FullTextSearch({ data }: Readonly<{ data: Spec103Data }>) {
  const fts = data.fts;
  return (
    <DemoSection testId="fts-card" title={t.fts.title}>
      <p className="mb-3 text-sm">{t.fts.intro}</p>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <dt>{t.fts.query}</dt>
        <dd data-testid="fts-query" className="font-mono">
          {fts.query}
        </dd>
        <dt>{t.fts.results}</dt>
        <dd data-testid="fts-result" className="font-mono">
          {t.fts.resultLine(fts.matchCount, fts.matchedLabel)}
        </dd>
        <dt>{t.fts.indexUsed}</dt>
        <dd>
          <Badge
            testId="fts-index"
            ok={fts.indexUsed}
            label={fts.indexUsed ? t.fts.yes : t.fts.no}
          />
        </dd>
      </dl>
      <p className="mt-4 text-sm">{t.fts.plan}</p>
      <pre
        data-testid="fts-plan"
        role="region"
        aria-label={t.fts.plan}
        tabIndex={0}
        className="mt-2 max-h-40 overflow-auto rounded-[8px] bg-surface-subtle p-3 text-xs break-all whitespace-pre-wrap"
      >
        {fts.plan}
      </pre>
    </DemoSection>
  );
}

export default async function Spec103Demo() {
  let data: Spec103Data;
  try {
    data = await loadSpec103Demo();
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
      <Programme data={data} />
      <Constraints data={data} />
      <FullTextSearch data={data} />
    </>
  );
}
