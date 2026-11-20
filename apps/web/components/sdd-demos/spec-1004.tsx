import { fr } from '@learny/i18n/fr/sdd';
import { Card, CardHeader, ScrollableTable } from '@learny/ui';

import { serverApi } from '../../lib/api/server-client';

const t = fr.sdd.spec1004;
const cell = 'px-3 py-2 align-top';

interface CoverageDemo {
  coverage: {
    registry: number;
    standard: number;
    specials: number;
    files: number;
    drift: number;
    uncovered: string[];
  };
  specials: Array<{ key: string; method: string; path: string }>;
}

export default async function Spec1004Demo() {
  const { coverage, specials } = (await (
    await serverApi()
  ).api.devSddSpec1004Demo({})) as CoverageDemo;
  const rows = [
    { id: 'registry', label: t.coverage.registry, value: coverage.registry },
    { id: 'implementations', label: t.coverage.implementations, value: coverage.standard },
    { id: 'specials', label: t.coverage.specials, value: coverage.specials },
    { id: 'files', label: t.coverage.files, value: coverage.files },
    { id: 'drift', label: t.coverage.drift, value: coverage.drift },
  ] as const;

  return (
    <>
      <p className="mt-6 text-13 text-ink-secondary">{t.intro}</p>
      <Card className="mt-6" data-testid="spec-1004-card" labelledBy="spec-1004-title">
        <CardHeader title={t.coverage.title} titleId="spec-1004-title" />
        <div className="mt-4">
          <ScrollableTable label={t.coverage.region}>
            <table
              className="w-full min-w-[20rem] text-left text-13"
              data-testid="spec-1004-coverage"
            >
              <caption className="sr-only">{t.coverage.region}</caption>
              <thead>
                <tr>
                  {t.coverage.columns.map((column) => (
                    <th key={column} scope="col" className={cell}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border" data-testid="spec-1004-row">
                    <th scope="row" className={cell}>
                      {row.label}
                    </th>
                    <td className={`${cell} font-mono`} data-testid={`spec-1004-${row.id}`}>
                      {row.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
          <p className="mt-3 text-13 text-ink-secondary" data-testid="spec-1004-verdict">
            {coverage.drift === 0 && coverage.uncovered.length === 0
              ? t.coverage.complete
              : t.coverage.incomplete}
          </p>
        </div>
      </Card>

      <details
        className="mt-6 rounded-card border border-border bg-surface p-4"
        data-testid="spec-1004-special"
      >
        <summary className="cursor-pointer font-display text-16 font-600">
          {t.special.summary}
        </summary>
        <div className="mt-4">
          <ScrollableTable label={t.special.region}>
            <table className="w-full min-w-[24rem] text-left text-13">
              <caption className="sr-only">{t.special.region}</caption>
              <thead>
                <tr>
                  {t.special.columns.map((column) => (
                    <th key={column} scope="col" className={cell}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {specials.map((handler) => (
                  <tr
                    key={handler.key}
                    className="border-t border-border"
                    data-testid="spec-1004-special-row"
                  >
                    <th scope="row" className={`${cell} font-mono`}>
                      {handler.method}
                    </th>
                    <td className={`${cell} font-mono`} data-testid="spec-1004-special-path">
                      {handler.path}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        </div>
      </details>
    </>
  );
}
