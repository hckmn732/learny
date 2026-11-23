// SPEC-2002 — demonstration page of the contract pipeline.
//
// Everything shown comes from the committed artefacts (`api/openapi.yaml` is summarised by
// `api/inventory.json`, `api/errors.json` and `api/events.schema.json`), so the page cannot drift
// from what the CI actually checks.
import errors from '../../../../api/errors.json';
import events from '../../../../api/events.schema.json';
import inventory from '../../../../api/inventory.json';

const ERROR_CODES = Object.keys(errors).length;
const EVENT_COUNT = Object.keys(events).length;

export default function Spec2002Demo() {
  return (
    <div className="mt-6 space-y-8">
      <section aria-labelledby="spec-2002-source">
        <h2 id="spec-2002-source" className="font-display text-xl font-semibold">
          Source unique du contrat
        </h2>
        <p className="mt-2 text-sm">
          <code className="font-mono text-xs">api/openapi.yaml</code> est généré depuis le registre
          Zod, puis vérifié en continu : toute dérive entre le registre et le contrat fait échouer
          la CI.
        </p>
        <dl data-testid="spec-2002-counts" className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-sm">Opérations</dt>
            <dd className="text-2xl font-semibold">{inventory.counts.operations}</dd>
          </div>
          <div>
            <dt className="text-sm">Codes d’erreur</dt>
            <dd data-testid="spec-2002-errors" className="text-2xl font-semibold">
              {ERROR_CODES}
            </dd>
          </div>
          <div>
            <dt className="text-sm">Événements</dt>
            <dd className="text-2xl font-semibold">{EVENT_COUNT}</dd>
          </div>
          <div>
            <dt className="text-sm">Routes spéciales</dt>
            <dd className="text-2xl font-semibold">{inventory.counts.special}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="spec-2002-sdk">
        <h2 id="spec-2002-sdk" className="font-display text-xl font-semibold">
          SDK TypeScript généré
        </h2>
        <p data-testid="spec-2002-sdk" className="mt-2 text-sm">
          Les types de <code className="font-mono text-xs">packages/api-sdk</code> sont produits
          depuis le contrat et commités ; leur fraîcheur est vérifiée par{' '}
          <code className="font-mono text-xs">pnpm sdk:check</code>.
        </p>
      </section>

      <section aria-labelledby="spec-2002-compat">
        <h2 id="spec-2002-compat" className="font-display text-xl font-semibold">
          Compatibilité
        </h2>
        <p data-testid="spec-2002-compat" className="mt-2 text-sm">
          L’outil <code className="font-mono text-xs">tools/contract/compat.mjs</code> compare deux
          documents opération par opération et n’accepte une rupture que si{' '}
          <code className="font-mono text-xs">api/contract-exceptions.yaml</code> la rattache à un
          ADR.
        </p>
      </section>
    </div>
  );
}
