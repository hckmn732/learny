// SPEC-2201 — demonstration page of the identity and formation Python contexts.
//
// Every figure comes from the committed artefacts: `api/inventory.json` (the operations, exported
// by SPEC-2001) and `api/ownership.yaml` (the ownership table the facade reads at startup). Nothing
// is written by hand here, so the page cannot drift from the evidence.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import inventory from '../../../../api/inventory.json';

interface OperationEntry {
  id: string;
  context: string;
  method: string;
  path: string;
}

const operations = inventory.operations as OperationEntry[];

function ownershipTable(): Record<string, string> {
  const file = path.join(process.cwd(), '..', '..', 'api', 'ownership.yaml');
  const source = readFileSync(file, 'utf8');
  const table: Record<string, string> = {};
  for (const line of source.split('\n')) {
    const match = /^\s+'?([\w.-]+)'?:\s+(py|ts)\s*$/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) table[match[1]] = match[2];
  }
  return table;
}

export default function Spec2201Demo() {
  const ownership = ownershipTable();
  const identity = operations.filter((operation) => operation.context === 'identity');
  const formation = operations.filter((operation) => operation.context === 'formation');
  const flipped = (context: string) =>
    operations.filter(
      (operation) => operation.context === context && ownership[operation.id] === 'py',
    ).length;
  const deferred = operations.filter(
    (operation) => operation.context !== 'identity' && operation.context !== 'formation',
  ).length;

  return (
    <div className="mt-6 space-y-8">
      <section aria-labelledby="spec-2201-bascule">
        <h2 id="spec-2201-bascule" className="font-display text-xl font-semibold">
          Bascule des opérations
        </h2>
        <p className="mt-2 text-sm">
          La façade sert une opération par Python dès que{' '}
          <code className="font-mono text-xs">api/ownership.yaml</code> la marque{' '}
          <code className="font-mono text-xs">py</code>; tout le reste est relayé à Hono sans
          modification. Les chiffres ci-dessous sont lus dans l’inventaire et dans la table de
          propriété, jamais saisis à la main.
        </p>
        <dl data-testid="spec-2201-flipped" className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-sm">Identity en Python</dt>
            <dd className="text-2xl font-semibold">
              {flipped('identity')} / {identity.length}
            </dd>
          </div>
          <div>
            <dt className="text-sm">Formation en Python</dt>
            <dd className="text-2xl font-semibold">
              {flipped('formation')} / {formation.length}
            </dd>
          </div>
          <div>
            <dt className="text-sm">Opérations de l’inventaire</dt>
            <dd className="text-2xl font-semibold">{operations.length}</dd>
          </div>
          <div>
            <dt className="text-sm">Hors périmètre</dt>
            <dd className="text-2xl font-semibold">{deferred}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="spec-2201-formation">
        <h2 id="spec-2201-formation" className="font-display text-xl font-semibold">
          Contexte formation
        </h2>
        <p className="mt-2 text-sm">
          Cadrage (chat de scoping sur <code className="font-mono text-xs">platform.llm</code>),
          programme (génération, propositions versionnées, validation émettant{' '}
          <code className="font-mono text-xs">formation/programme-validated</code>), formations à
          plusieurs (code <code className="font-mono text-xs">LRN-XXXX</code>, dix membres, copie
          individuelle à la sortie), carte des notions (le trigger{' '}
          <code className="font-mono text-xs">validate_notion_link</code> refuse les cycles) et
          recherche globale (fonction SQL{' '}
          <code className="font-mono text-xs">search_user_content</code>).
        </p>
        <ul data-testid="spec-2201-operations" className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {formation.map((operation) => (
            <li key={operation.id} className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-xs">{operation.id}</span>
              <span
                className={
                  ownership[operation.id] === 'py'
                    ? 'rounded bg-green-soft px-2 py-0.5 text-green-ink'
                    : 'rounded bg-canvas px-2 py-0.5 text-ink-muted'
                }
              >
                {ownership[operation.id] ?? 'ts'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="spec-2201-differe">
        <h2 id="spec-2201-differe" className="font-display text-xl font-semibold">
          Périmètre différé documenté
        </h2>
        <p data-testid="spec-2201-deferred" className="mt-2 text-sm">
          Les cinq opérations <code className="font-mono text-xs">auth.*</code> restent TypeScript :
          leurs cookies <code className="font-mono text-xs">@supabase/ssr</code> ne sont comparables
          faute de captures et de vecteurs (ADR-2022).{' '}
          <code className="font-mono text-xs">home.get</code> dépend du moteur d’apprentissage de
          SPEC-2202 (ADR-2023) et <code className="font-mono text-xs">formations.resume</code> du
          planificateur de la même spécification (ADR-2024). Aucune autre opération du périmètre
          n’est laissée de côté.
        </p>
      </section>

      <section aria-labelledby="spec-2201-parite">
        <h2 id="spec-2201-parite" className="font-display text-xl font-semibold">
          Preuves de parité
        </h2>
        <p data-testid="spec-2201-parity" className="mt-2 text-sm">
          Les réponses des lectures de l’inventaire sont enregistrées contre le backend TypeScript
          puis rejouées contre la façade Python : mêmes statuts, mêmes en-têtes comparés, mêmes
          corps après normalisation des identifiants et des instants. Les tests d’intégration Python
          rejouent en plus chaque cas des services TypeScript sur la base locale partagée.
        </p>
      </section>
    </div>
  );
}
