// SPEC-1002 §10 — démonstration des paquets partagés (ADR-1007) : dépendances autorisées et
// contrôle de portabilité par paquet, puis appel réel de GET /api/v1/health depuis le navigateur
// avec @learny/api-client (EF-5). Rendu serveur pour le tableau ; la carte santé est un
// composant client (précédent SPEC-508).
import { fr } from '@learny/i18n/fr/sdd';
import { Card, CardHeader, ScrollableTable } from '@learny/ui';

import { Spec1002HealthCard } from './spec-1002-client';

const t = fr.sdd.spec1002;

const cell = 'px-3 py-2 align-top';

// Dépendances autorisées (ADR-1007, ET-2) ; « Portable » reflète le contrôle exécuté par
// tools/migration/test/unit/shared-packages.test.ts (CA-1) — valeur versionnée, déterministe.
const PACKAGES = [
  { name: '@learny/contracts', dependencies: 'core, zod' },
  { name: '@learny/core (entrée .)', dependencies: 'aucune (pino reste derrière ./server)' },
  { name: '@learny/api-client', dependencies: 'contracts, core' },
  { name: '@learny/domain', dependencies: 'contracts, core, learning-engine, bricks' },
  { name: '@learny/i18n', dependencies: 'aucune' },
  { name: '@learny/learning-engine', dependencies: 'core, ts-fsrs' },
] as const;

export default function Spec1002Demo() {
  return (
    <>
      <p className="mt-6 text-13 text-ink-secondary">{t.intro}</p>
      <Card className="mt-6" data-testid="spec-1002-packages" labelledBy="spec-1002-packages-title">
        <CardHeader title={t.packages.title} titleId="spec-1002-packages-title" />
        <div className="mt-4">
          <ScrollableTable label={t.packages.region}>
            <table className="w-full min-w-[24rem] text-left text-13">
              <caption className="sr-only">{t.packages.region}</caption>
              <thead>
                <tr>
                  {t.packages.columns.map((column) => (
                    <th key={column} scope="col" className={cell}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PACKAGES.map((pkg) => (
                  <tr
                    key={pkg.name}
                    className="border-t border-border"
                    data-testid="spec-1002-package-row"
                  >
                    <th scope="row" className={`${cell} font-mono`}>
                      {pkg.name}
                    </th>
                    <td className={cell}>{pkg.dependencies}</td>
                    <td className={`${cell} font-600`} data-testid="spec-1002-portable">
                      {t.packages.yes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        </div>
        <p className="mt-4 text-13 text-ink-secondary">{t.note}</p>
      </Card>
      <Card className="mt-6" data-testid="spec-1002-health" labelledBy="spec-1002-health-title">
        <CardHeader title={t.health.title} titleId="spec-1002-health-title" />
        <Spec1002HealthCard />
      </Card>
    </>
  );
}
