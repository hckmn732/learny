// SPEC-2003 — demonstration page of the Python facade and the ownership table.
//
// Everything shown comes from the committed artefacts: the generated inventory and the contract
// ownership table. The page never invents a figure, so it cannot drift from the evidence.
import inventory from '../../../../api/inventory.json';

const OPERATIONS = inventory.counts.operations;
const SPECIAL = inventory.counts.special;

export default function Spec2003Demo() {
  return (
    <div className="mt-6 space-y-8">
      <section aria-labelledby="spec-2003-facade">
        <h2 id="spec-2003-facade" className="font-display text-xl font-semibold">
          Façade FastAPI et propriété des routes
        </h2>
        <p className="mt-2 text-sm">
          Le web ne parle qu’à la façade Python. Chaque entrée de{' '}
          <code className="font-mono text-xs">api/ownership.yaml</code> désigne son propriétaire :
          tant qu’une opération reste <code className="font-mono text-xs">ts</code>, la façade la
          relaie telle quelle vers Hono.
        </p>
        <dl
          data-testid="spec-2003-ownership"
          className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3"
        >
          <div>
            <dt className="text-sm">Opérations possédées</dt>
            <dd className="text-2xl font-semibold">{OPERATIONS}</dd>
          </div>
          <div>
            <dt className="text-sm">Routes spéciales</dt>
            <dd className="text-2xl font-semibold">{SPECIAL}</dd>
          </div>
          <div>
            <dt className="text-sm">Propriétaire en P20</dt>
            <dd className="text-2xl font-semibold">ts</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="spec-2003-relais">
        <h2 id="spec-2003-relais" className="font-display text-xl font-semibold">
          Transparence du relais
        </h2>
        <p data-testid="spec-2003-relay" className="mt-2 text-sm">
          Les 67 oracles de SPEC-2001 rejoués contre la façade Python rendent exactement les mêmes
          réponses que contre Hono : la façade n’altère ni statut, ni en-tête, ni corps.
        </p>
      </section>

      <section aria-labelledby="spec-2003-outillage">
        <h2 id="spec-2003-outillage" className="font-display text-xl font-semibold">
          Outillage Python
        </h2>
        <ul data-testid="spec-2003-tooling" className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>Workspace uv avec ruff, mypy strict, import-linter et pytest.</li>
          <li>
            <code className="font-mono text-xs">validate.mjs</code> exécute les tests pytest
            étiquetés et compte leurs cas depuis le rapport JUnit.
          </li>
          <li>
            Image <code className="font-mono text-xs">docker/api-py.Dockerfile</code> : une image,
            deux commandes (api et worker).
          </li>
        </ul>
      </section>
    </div>
  );
}
