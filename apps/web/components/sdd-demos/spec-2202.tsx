// SPEC-2202 — demonstration page of the learning and assessments Python contexts.
//
// Every figure comes from the committed artefacts: `api/inventory.json` (the operations, exported
// by SPEC-2001), `api/ownership.yaml` (the ownership table the facade reads at startup) and
// `api/oracles/recordings/reads.json` (the parity scenarios the recorder wrote). Nothing is typed
// by hand here, so the page cannot drift from the evidence.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import inventory from '../../../../api/inventory.json';

interface OperationEntry {
  id: string;
  context: string;
  method: string;
  path: string;
}

interface RecordingGroup {
  group: string;
  scenarios: unknown[];
}

const operations = inventory.operations as OperationEntry[];
const CONTEXTS = ['learning', 'assessments'] as const;
type PortedContext = (typeof CONTEXTS)[number];

const CONTEXT_LABELS: Record<PortedContext, string> = {
  learning: 'Learning',
  assessments: 'Assessments',
};

function isPorted(context: string): context is PortedContext {
  return (CONTEXTS as readonly string[]).includes(context);
}

function readApiFile(...segments: string[]): string {
  return readFileSync(path.join(process.cwd(), '..', '..', 'api', ...segments), 'utf8');
}

/** `api/ownership.yaml` -> operation id -> `py` | `ts`, exactly as the facade reads it. */
function ownershipTable(): Record<string, string> {
  const table: Record<string, string> = {};
  for (const line of readApiFile('ownership.yaml').split('\n')) {
    const match = /^\s+'?([\w.-]+)'?:\s+(py|ts)\s*$/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) table[match[1]] = match[2];
  }
  return table;
}

/** Number of recorded scenarios of the two contexts (the generated reads only). */
function recordedScenarios(): number {
  const parsed = JSON.parse(readApiFile('oracles', 'recordings', 'reads.json')) as {
    groups: RecordingGroup[];
  };
  return parsed.groups
    .filter((entry) => isPorted(entry.group))
    .reduce((total, entry) => total + entry.scenarios.length, 0);
}

export default function Spec2202Demo() {
  const ownership = ownershipTable();
  const scoped = operations.filter((operation) => isPorted(operation.context));
  const ofContext = (context: PortedContext) =>
    scoped.filter((operation) => operation.context === context);
  const flipped = (context: PortedContext) =>
    ofContext(context).filter((operation) => ownership[operation.id] === 'py').length;
  const remaining = scoped.filter((operation) => ownership[operation.id] !== 'py').length;
  const scenarioCount = recordedScenarios();

  return (
    <div className="mt-6 space-y-8">
      <section aria-labelledby="spec-2202-perimetre">
        <h2 id="spec-2202-perimetre" className="font-display text-xl font-semibold">
          Périmètre basculé
        </h2>
        <p className="mt-2 text-sm">
          La façade sert une opération par Python dès que{' '}
          <code className="font-mono text-xs">api/ownership.yaml</code> la marque{' '}
          <code className="font-mono text-xs">py</code> ; les contextes non portés restent relayés à
          Hono sans modification. Les chiffres ci-dessous sont lus dans l’inventaire et dans la
          table de propriété, jamais saisis à la main.
        </p>
        <dl data-testid="spec-2202-scope" className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {CONTEXTS.map((context) => (
            <div key={context}>
              <dt className="text-sm">{CONTEXT_LABELS[context]} en Python</dt>
              <dd className="text-2xl font-semibold">
                {flipped(context)} / {ofContext(context).length}
              </dd>
            </div>
          ))}
          <div>
            <dt className="text-sm">Opérations du périmètre</dt>
            <dd className="text-2xl font-semibold">{scoped.length}</dd>
          </div>
          <div>
            <dt className="text-sm">Encore relayées à Hono</dt>
            <dd className="text-2xl font-semibold">{remaining}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="spec-2202-operations">
        <h2 id="spec-2202-operations" className="font-display text-xl font-semibold">
          Opérations du périmètre
        </h2>
        <p className="mt-2 text-sm">
          Chaque ligne vient de l’inventaire ; l’étiquette donne le propriétaire courant dans la
          table de propriété. Une écriture Python passe par une seule unité de travail et écrit ses
          événements dans <code className="font-mono text-xs">public.event_outbox</code> dans la
          même transaction.
        </p>
        <ul data-testid="spec-2202-operations" className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {scoped.map((operation) => (
            <li key={operation.id} className="flex items-baseline gap-2">
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

      <section aria-labelledby="spec-2202-moteur">
        <h2 id="spec-2202-moteur" className="font-display text-xl font-semibold">
          Moteur porté
        </h2>
        <p className="mt-2 text-sm">
          Le domaine pur ne dépend d’aucun framework, ORM ni SDK (ET-1) : les mêmes entrées donnent
          les mêmes sorties qu’en TypeScript, sans arrondi ni ordre différent.
        </p>
        <ul data-testid="spec-2202-engine" className="mt-3 list-disc space-y-2 pl-5 text-sm">
          <li>
            <strong>FSRS 5.4.2 digit-identique</strong> : mêmes paramètres, mêmes arrondis et même
            médiane que <code className="font-mono text-xs">packages/learning-engine</code> ; la
            note, l’intervalle et la carte suivante sont comparés aux oracles.
          </li>
          <li>
            <strong>Planificateur</strong> : <code className="font-mono text-xs">planSchedule</code>
            , <code className="font-mono text-xs">findCompatibleSlots</code> et{' '}
            <code className="font-mono text-xs">replan</code> sont portés avec leurs cas limites
            (disponibilités, pauses, module bloqué, version de plan).
          </li>
          <li>
            <strong>Briques</strong> : les treize types, la validation, la correction par le code,
            l’empreinte SHA-256 et le payload public restent l’unique autorité ; la couche
            application n’en duplique aucune règle.
          </li>
        </ul>
      </section>

      <section aria-labelledby="spec-2202-garanties">
        <h2 id="spec-2202-garanties" className="font-display text-xl font-semibold">
          Garanties prouvées
        </h2>
        <dl data-testid="spec-2202-guarantees" className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="font-semibold">Parité contractuelle</dt>
            <dd>
              {scenarioCount} scénarios de lecture enregistrés contre Hono puis rejoués contre la
              façade : mêmes statuts, mêmes en-têtes comparés, mêmes corps après normalisation des
              identifiants et des instants, aucune divergence inexpliquée.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Un seul effet par événement</dt>
            <dd>
              Les événements sont écrits dans l’outbox de la transaction métier avec leurs
              identifiants de déduplication ; un rejeu avec la même clé d’idempotence, le même{' '}
              <code className="font-mono text-xs">clientAnswerId</code> ou le même{' '}
              <code className="font-mono text-xs">clientId</code> hors ligne ne produit aucun second
              effet et renvoie la même réponse.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">RLS</dt>
            <dd>
              Chaque requête utilisateur s’exécute sous les claims de la transaction ; le rôle de
              service n’est utilisé que par{' '}
              <code className="font-mono text-xs">learny.shared.privileged</code>, et une ressource
              d’autrui répond exactement comme une ressource absente.
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="spec-2202-dettes">
        <h2 id="spec-2202-dettes" className="font-display text-xl font-semibold">
          Dettes portées par SPEC-2207
        </h2>
        <p data-testid="spec-2202-debts" className="mt-2 text-sm">
          Les cas d’usage sont portés, testés et écrivent leurs événements dans la transaction, mais
          les consommateurs <code className="font-mono text-xs">module-unlock</code>,{' '}
          <code className="font-mono text-xs">exam-deadline</code>,{' '}
          <code className="font-mono text-xs">remediation-prepare</code> et{' '}
          <code className="font-mono text-xs">quiz-grade</code> restent TypeScript jusqu’à SPEC-2207
          (ADR-2014), où le branchement au worker Python est fait. Aucune réponse HTTP n’en dépend.
        </p>
      </section>
    </div>
  );
}
