import { serverApi } from '../../lib/api/server-client';

interface Demo {
  categories: Record<string, number>;
  dependencies: string[];
  serverModules: number;
}

const LABELS: Record<string, string> = {
  pages: 'Pages',
  lib: 'Bibliothèques',
  components: 'Composants',
  dev: 'Démonstrations',
  proxy: 'Proxy',
  apiRoutes: 'Routes API du web',
};

export default async function Spec1203Demo() {
  const demo = (await (await serverApi()).api.devSddSpec1203Demo({})) as Demo;
  return (
    <div className="mt-6 grid gap-6">
      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="font-display text-xl font-600">Couplage du web</h2>
        <table data-testid="spec-1203-coupling" className="mt-4 w-full text-left text-14">
          <thead>
            <tr>
              <th scope="col">Catégorie</th>
              <th scope="col">Fichiers couplés</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(demo.categories).map(([key, count]) => (
              <tr key={key} className="border-t border-divider">
                <th scope="row" className="py-2 font-medium">
                  {LABELS[key] ?? key}
                </th>
                <td className="py-2 font-mono">{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="font-display text-xl font-600">Dépendances partagées</h2>
        <ul data-testid="spec-1203-dependencies" className="mt-4 flex flex-wrap gap-2">
          {demo.dependencies.map((dependency) => (
            <li
              key={dependency}
              className="rounded-pill border border-border bg-canvas px-3 py-1 font-mono text-13"
            >
              {dependency}
            </li>
          ))}
        </ul>
      </section>

      <section
        data-testid="spec-1203-bundle"
        className="rounded-card border border-green bg-green-soft p-4"
      >
        <h2 className="font-display text-xl font-600">Construction client</h2>
        <p className="mt-2 text-14">Modules serveur dans la construction : {demo.serverModules}</p>
      </section>
    </div>
  );
}
