import fs from 'node:fs';
import path from 'node:path';

import { SPECIAL_HANDLERS, routeCoverage, type GeneratedRouteFile } from '@learny/api-routes';
import { fr } from '@learny/i18n/fr/sdd';
import { Card, CardHeader, ScrollableTable } from '@learny/ui';

const t = fr.sdd.spec1004;
const cell = 'px-3 py-2 align-top';

/**
 * SPEC-1004 EF-6 — the demonstration reads the generated tree on the server and compares it with
 * the tables, so "Dérive" is a measurement, never a constant. The authoritative check remains
 * `pnpm migration:routes:check` (EF-4); both use `routeCoverage`.
 */
function scanGenerated(): GeneratedRouteFile[] {
  const app = path.join(process.cwd(), 'app');
  const directory = path.join(app, 'api');
  const files: GeneratedRouteFile[] = [];
  if (!fs.existsSync(directory)) return files;
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.name !== 'route.ts') continue;
      const source = fs.readFileSync(full, 'utf8');
      const methods = [
        ...source.matchAll(/^export const (GET|POST|PUT|PATCH|DELETE) = /gm),
      ].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
      files.push({ path: path.relative(app, full).split(path.sep).join('/'), methods });
    }
  };
  walk(directory);
  return files;
}

export default function Spec1004Demo() {
  const coverage = routeCoverage(scanGenerated());
  const specials = Object.entries(SPECIAL_HANDLERS).sort(([left], [right]) =>
    left.localeCompare(right),
  );
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
                {specials.map(([key, handler]) => (
                  <tr
                    key={key}
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
