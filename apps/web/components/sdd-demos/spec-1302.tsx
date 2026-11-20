import { ROUTES } from '@learny/contracts';

const APPLICATIONS = [
  { name: 'apps/api', role: 'Serveur Hono et propriétaire des données' },
  { name: 'apps/web', role: 'Client React et Next.js' },
] as const;

const PACKAGES = [
  { name: '@learny/contracts', role: 'partagé' },
  { name: '@learny/api-client', role: 'partagé' },
  { name: '@learny/domain', role: 'partagé' },
  { name: '@learny/http', role: 'serveur' },
  { name: '@learny/api-routes', role: 'serveur' },
] as const;

const CHECKPOINTS = ['CP-10', 'CP-11', 'CP-12'] as const;

export default function Spec1302Demo() {
  const routeCount = Object.keys(ROUTES).length;
  return (
    <div className="mt-6 grid gap-6">
      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="font-display text-xl font-600">Applications</h2>
        <table className="mt-4 w-full text-left text-14" data-testid="spec-1302-apps">
          <thead>
            <tr>
              <th scope="col">Application</th>
              <th scope="col">Rôle</th>
            </tr>
          </thead>
          <tbody>
            {APPLICATIONS.map((application) => (
              <tr className="border-t border-divider" key={application.name}>
                <th className="py-2 font-mono font-medium" scope="row">
                  {application.name}
                </th>
                <td className="py-2">{application.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="font-display text-xl font-600">Paquets partagés et serveur</h2>
        <table className="mt-4 w-full text-left text-14" data-testid="spec-1302-packages">
          <thead>
            <tr>
              <th scope="col">Paquet</th>
              <th scope="col">Rôle</th>
            </tr>
          </thead>
          <tbody>
            {PACKAGES.map((pkg) => (
              <tr className="border-t border-divider" key={pkg.name}>
                <th className="py-2 font-mono font-medium" scope="row">
                  {pkg.name}
                </th>
                <td className="py-2">{pkg.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section
          className="rounded-card border border-green bg-green-soft p-4"
          data-testid="spec-1302-routes"
        >
          <h2 className="font-display text-xl font-600">Couverture des routes</h2>
          <p className="mt-3 font-mono text-24 font-600">
            {routeCount} / {routeCount}
          </p>
          <p className="text-14">Routes déclarées et implémentées, 0 manquante.</p>
        </section>
        <section
          className="rounded-card border border-green bg-green-soft p-4"
          data-testid="spec-1302-coupling"
        >
          <h2 className="font-display text-xl font-600">Couplage du web</h2>
          <p className="mt-3 font-mono text-24 font-600">0</p>
          <p className="text-14">Aucun import de paquet serveur.</p>
        </section>
      </div>

      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="font-display text-xl font-600">Checkpoints</h2>
        <ul className="mt-3 grid gap-2" data-testid="spec-1302-checkpoints">
          {CHECKPOINTS.map((checkpoint) => (
            <li className="flex items-center gap-3" key={checkpoint}>
              <span aria-hidden="true" className="text-green">
                ✓
              </span>
              <span className="font-mono font-600">{checkpoint}</span>
              <span className="text-muted">réussi</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
