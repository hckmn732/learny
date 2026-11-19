// SPEC-1001 §10 — démonstration de la piste de migration : couplage résiduel de apps/web lu
// dans `progress/migration.json` (régénéré par pnpm migration:report, EF-6). La page n'appelle
// aucun service : elle est un client du rapport, comme apps/web doit devenir un client de
// l'API (ADR-1003). Sans rapport, les valeurs restent à zéro et la note l'explique : aucun
// état de chargement, le rendu est intégralement serveur.
import fs from 'node:fs';
import path from 'node:path';

import { fr } from '@learny/i18n/fr/sdd';
import { Card, CardHeader, ScrollableTable } from '@learny/ui';

const t = fr.sdd.spec1001;

const CATEGORIES = ['pages', 'lib', 'components', 'dev', 'proxy', 'apiRoutes'] as const;
type Category = (typeof CATEGORIES)[number];

interface MigrationReport {
  coupling: Record<Category, number>;
  routes: { registry: number; routeFiles: number };
  clientComponents: string[];
}

const EMPTY_REPORT: MigrationReport = {
  coupling: { pages: 0, lib: 0, components: 0, dev: 0, proxy: 0, apiRoutes: 0 },
  routes: { registry: 0, routeFiles: 0 },
  clientComponents: [],
};

// Le serveur Next tourne depuis apps/web : le rapport se cherche depuis le répertoire courant
// puis depuis la racine du monorepo (même repli que spec-807).
function findFile(relative: string): string | null {
  for (const base of [process.cwd(), path.resolve(process.cwd(), '..', '..')]) {
    const candidate = path.resolve(base, relative);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function loadReport(): MigrationReport | null {
  const file = findFile(path.join('progress', 'migration.json'));
  if (file === null) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as MigrationReport;
  } catch {
    return null;
  }
}

const cell = 'px-3 py-2 align-top';

export default function Spec1001Demo() {
  const report = loadReport();
  const data = report ?? EMPTY_REPORT;
  return (
    <>
      <p className="mt-6 text-13 text-ink-secondary">{t.intro}</p>
      <Card className="mt-6" data-testid="spec-1001-coupling" labelledBy="spec-1001-coupling-title">
        <CardHeader title={t.coupling.title} titleId="spec-1001-coupling-title" />
        <p className="mt-4 text-13 text-ink-muted" data-testid="spec-1001-report">
          {report === null ? t.reportMissing : t.reportPresent}
        </p>
        <div className="mt-4">
          <ScrollableTable label={t.coupling.region}>
            <table className="w-full min-w-[24rem] text-left text-13">
              <caption className="sr-only">{t.coupling.region}</caption>
              <thead>
                <tr>
                  {t.coupling.columns.map((column) => (
                    <th key={column} scope="col" className={cell}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map((category) => (
                  <tr
                    key={category}
                    className="border-t border-border"
                    data-testid="spec-1001-category-row"
                    data-category={category}
                  >
                    <th scope="row" className={cell}>
                      {t.coupling.labels[category]}
                    </th>
                    <td
                      className={`${cell} font-600 tabular-nums`}
                      data-testid="spec-1001-category-count"
                    >
                      {String(data.coupling[category])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        </div>
      </Card>
      <Card className="mt-6" data-testid="spec-1001-routes" labelledBy="spec-1001-routes-title">
        <CardHeader title={t.routes.title} titleId="spec-1001-routes-title" />
        <dl className="mt-4 grid grid-cols-1 gap-2 text-13 sm:grid-cols-2">
          <div>
            <dt className="text-ink-secondary">{t.routes.registry}</dt>
            <dd className="font-600 tabular-nums" data-testid="spec-1001-routes-registry">
              {String(data.routes.registry)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-secondary">{t.routes.files}</dt>
            <dd className="font-600 tabular-nums" data-testid="spec-1001-routes-files">
              {String(data.routes.routeFiles)}
            </dd>
          </div>
        </dl>
      </Card>
      <Card
        className="mt-6"
        data-testid="spec-1001-client-components"
        labelledBy="spec-1001-clients-title"
      >
        <CardHeader title={t.clients.title} titleId="spec-1001-clients-title" />
        {data.clientComponents.length === 0 ? (
          <p className="mt-4 text-13 text-ink-muted">{t.clients.empty}</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2 text-13">
            {data.clientComponents.map((file) => (
              <li className="font-mono" data-testid="spec-1001-client-component" key={file}>
                {file}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-13 text-ink-secondary">{t.note}</p>
      </Card>
    </>
  );
}
