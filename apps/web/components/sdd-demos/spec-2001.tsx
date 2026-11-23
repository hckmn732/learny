// SPEC-2001 — demonstration page of the inventory and the parity matrix.
//
// The data comes from the committed artefacts of the specification (`api/inventory.json` and
// `api/oracles/recordings/reads.json`), so the page can never drift from the evidence: it is a
// rendering of what the tooling produced, not a hand-written summary.
import inventory from '../../../../api/inventory.json';
import recording from '../../../../api/oracles/recordings/reads.json';

const CONTEXT_LABELS: Record<string, string> = {
  identity: 'Identité',
  formation: 'Formations',
  learning: 'Apprentissage',
  assessments: 'Évaluations',
  content: 'Contenus',
  tutor: 'Tuteur',
  engagement: 'Engagement',
  billing: 'Facturation',
  privacy: 'Données personnelles',
  dev: 'Développement',
  'jobs-demo': 'Jobs de démonstration',
  special: 'Routes spéciales',
};

function countByContext(): { context: string; spec: string; total: number }[] {
  const counts = new Map<string, { spec: string; total: number }>();
  for (const operation of inventory.operations) {
    const current = counts.get(operation.context);
    if (current === undefined) counts.set(operation.context, { spec: operation.spec, total: 1 });
    else current.total += 1;
  }
  return [...counts.entries()]
    .map(([context, value]) => ({ context, spec: value.spec, total: value.total }))
    .sort((left, right) => right.total - left.total);
}

export default function Spec2001Demo() {
  const contexts = countByContext();
  const scenarios = recording.groups.reduce((sum, group) => sum + group.scenarios.length, 0);
  const gaps = inventory.counts.gaps;

  return (
    <div className="mt-6 space-y-8">
      <section aria-labelledby="spec-2001-counters">
        <h2 id="spec-2001-counters" className="font-display text-xl font-semibold">
          Référence du backend TypeScript
        </h2>
        <dl data-testid="spec-2001-counts" className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div>
            <dt className="text-sm">Opérations</dt>
            <dd className="text-2xl font-semibold">{inventory.counts.operations}</dd>
          </div>
          <div>
            <dt className="text-sm">Routes spéciales</dt>
            <dd className="text-2xl font-semibold">{inventory.counts.special}</dd>
          </div>
          <div>
            <dt className="text-sm">Événements</dt>
            <dd className="text-2xl font-semibold">{inventory.counts.events}</dd>
          </div>
          <div>
            <dt className="text-sm">Jobs</dt>
            <dd className="text-2xl font-semibold">{inventory.counts.jobs}</dd>
          </div>
          <div>
            <dt className="text-sm">Lacunes CL-1</dt>
            <dd data-testid="spec-2001-gaps" className="text-2xl font-semibold">
              {gaps}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="spec-2001-contexts">
        <h2 id="spec-2001-contexts" className="font-display text-xl font-semibold">
          Contexte cible de chaque opération
        </h2>
        <table data-testid="spec-2001-contexts" className="mt-3 w-full text-left text-sm">
          <caption className="sr-only">
            Nombre d’opérations par contexte de la piste python-migration
          </caption>
          <thead>
            <tr>
              <th scope="col" className="py-1">
                Contexte
              </th>
              <th scope="col" className="py-1">
                Spécification
              </th>
              <th scope="col" className="py-1">
                Opérations
              </th>
            </tr>
          </thead>
          <tbody>
            {contexts.map((entry) => (
              <tr key={entry.context}>
                <td className="py-1">{CONTEXT_LABELS[entry.context] ?? entry.context}</td>
                <td className="py-1 font-mono text-xs">{entry.spec}</td>
                <td className="py-1">{entry.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="spec-2001-parity">
        <h2 id="spec-2001-parity" className="font-display text-xl font-semibold">
          Oracles de parité
        </h2>
        <p data-testid="spec-2001-parity" className="mt-2 text-sm">
          {scenarios} scénarios de lecture enregistrés contre le backend TypeScript et rejoués à
          l’identique deux fois de suite.
        </p>
        <p className="mt-1 text-sm">
          Les vecteurs inter-langages (rendu JSON, moteur d’apprentissage, chiffrement) sont
          versionnés sous <code className="font-mono text-xs">api/oracles/vectors/</code>.
        </p>
      </section>
    </div>
  );
}
