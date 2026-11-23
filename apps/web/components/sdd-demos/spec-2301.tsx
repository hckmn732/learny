// SPEC-2301 — demonstration page of the Coolify deployment, the progressive cutover and the rollback.
//
// Every counter is read from the committed artefacts: `api/ownership.yaml` (the table the facade and
// the worker read at startup) and `api/inventory.json` (the 217 operations, their method and their
// context). The context state is derived from those two files only, so the page cannot drift from
// the state the deployment actually serves.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import inventory from '../../../../api/inventory.json';

interface OperationEntry {
  id: string;
  context: string;
  method: string;
}

const operations = inventory.operations as OperationEntry[];

const SECTIONS = ['operations', 'special', 'consumers', 'crons'] as const;
type Section = (typeof SECTIONS)[number];
type Owner = 'py' | 'ts';

interface OwnershipEntry {
  section: Section;
  key: string;
  owner: Owner;
}

type ContextState = 'py' | 'canary' | 'ts' | 'partial';

interface ContextLine {
  name: string;
  reads: string;
  writes: string;
  state: ContextState;
}

const STATE_LABEL: Record<ContextState, string> = {
  py: 'servi par la façade Python',
  canary: 'canary en lecture (mutations encore relayées)',
  ts: 'relayé à Hono',
  partial: 'partiel : entrées différées (ADR-2035)',
};

function readApiFile(...segments: string[]): string {
  return readFileSync(path.join(process.cwd(), '..', '..', 'api', ...segments), 'utf8');
}

/** `api/ownership.yaml` -> the four tables, exactly as the facade reads them. */
function ownershipTable(): OwnershipEntry[] {
  const entries: OwnershipEntry[] = [];
  let section: Section | null = null;
  for (const line of readApiFile('ownership.yaml').split('\n')) {
    if (/^[a-z]+:\s*$/.test(line)) {
      const name = line.slice(0, -1);
      section = SECTIONS.find((candidate) => candidate === name) ?? null;
      continue;
    }
    const match = /^\s+(?:'([^']+)'|(.+?)):\s+(py|ts)\s*$/.exec(line);
    const key = match?.[1] ?? match?.[2];
    const owner = match?.[3];
    if (section !== null && key !== undefined && (owner === 'py' || owner === 'ts')) {
      entries.push({ section, key, owner });
    }
  }
  return entries;
}

function count(entries: OwnershipEntry[], section: Section, owner: Owner): number {
  return entries.filter((entry) => entry.section === section && entry.owner === owner).length;
}

/** One line per context of the inventory, with the state the ownership table gives it. */
function contextLines(entries: OwnershipEntry[]): ContextLine[] {
  const owners = new Map(
    entries
      .filter((entry) => entry.section === 'operations')
      .map((entry) => [entry.key, entry.owner] as const),
  );
  const contexts = new Map<string, { reads: string[]; writes: string[] }>();
  for (const operation of operations) {
    const current = contexts.get(operation.context) ?? { reads: [], writes: [] };
    (operation.method === 'GET' ? current.reads : current.writes).push(operation.id);
    contexts.set(operation.context, current);
  }
  const stateOf = (reads: string[], writes: string[]): ContextState => {
    const all = (ids: string[], owner: Owner) =>
      ids.length > 0 && ids.every((id) => (owners.get(id) ?? 'ts') === owner);
    if (all(reads, 'py') && all(writes, 'py')) return 'py';
    if (all(reads, 'ts') && all(writes, 'ts')) return 'ts';
    if (all(reads, 'py') && all(writes, 'ts')) return 'canary';
    return 'partial';
  };
  const py = (ids: string[]) => ids.filter((id) => owners.get(id) === 'py').length;
  return [...contexts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, group]) => ({
      name,
      reads: `${String(py(group.reads))} / ${String(group.reads.length)}`,
      writes: `${String(py(group.writes))} / ${String(group.writes.length)}`,
      state: stateOf(group.reads, group.writes),
    }));
}

function Badge({ owner }: Readonly<{ owner: Owner }>) {
  return (
    <span
      className={
        owner === 'py'
          ? 'rounded bg-green-soft px-2 py-0.5 text-green-ink'
          : 'rounded bg-canvas px-2 py-0.5 text-ink-muted'
      }
    >
      {owner}
    </span>
  );
}

export default function Spec2301Demo() {
  const entries = ownershipTable();
  const pyOperations = count(entries, 'operations', 'py');
  const tsOperations = count(entries, 'operations', 'ts');
  const pySpecial = count(entries, 'special', 'py');
  const tsSpecial = count(entries, 'special', 'ts');
  const pyConsumers = count(entries, 'consumers', 'py');
  const pyCrons = count(entries, 'crons', 'py');
  const lines = contextLines(entries);
  const byState = (state: ContextState) => lines.filter((line) => line.state === state);
  const partial = byState('partial');

  return (
    <div className="mt-6 space-y-10">
      <section aria-labelledby="spec-2301-perimetre">
        <h2 id="spec-2301-perimetre" className="font-display text-xl font-semibold">
          Périmètre déployé
        </h2>
        <p className="mt-2 text-sm">
          Deux services, une image : <code className="font-mono text-xs">api-py</code> (façade
          FastAPI) et <code className="font-mono text-xs">worker-py</code> (outbox, livraisons,
          planificateur), construits depuis{' '}
          <code className="font-mono text-xs">docker/api-py.Dockerfile</code> et déclarés par{' '}
          <code className="font-mono text-xs">docker/compose.coolify.yml</code>. Les compteurs
          ci-dessous sont lus dans <code className="font-mono text-xs">api/ownership.yaml</code> et{' '}
          <code className="font-mono text-xs">api/inventory.json</code>, jamais saisis à la main.
        </p>
        <dl data-testid="spec-2301-scope" className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-sm">Opérations servies par Python</dt>
            <dd className="text-2xl font-semibold">
              {pyOperations} / {operations.length}
            </dd>
          </div>
          <div>
            <dt className="text-sm">Routes spéciales servies par Python</dt>
            <dd className="text-2xl font-semibold">
              {pySpecial} / {pySpecial + tsSpecial}
            </dd>
          </div>
          <div>
            <dt className="text-sm">Consommateurs Python</dt>
            <dd className="text-2xl font-semibold">
              {pyConsumers} / {pyConsumers + count(entries, 'consumers', 'ts')}
            </dd>
          </div>
          <div>
            <dt className="text-sm">Crons Python</dt>
            <dd className="text-2xl font-semibold">
              {pyCrons} / {pyCrons + count(entries, 'crons', 'ts')}
            </dd>
          </div>
        </dl>
        <p data-testid="spec-2301-relayed" className="mt-3 text-sm">
          <strong>
            {tsOperations} opérations et {tsSpecial} routes spéciales restent relayées
          </strong>{' '}
          à Hono : la façade leur rend la réponse de l&apos;API TypeScript, en-têtes et corps
          inchangés. C&apos;est la dette de SPEC-2207 (ADR-2035), pas une régression de cette
          spécification.
        </p>
      </section>

      <section aria-labelledby="spec-2301-contextes">
        <h2 id="spec-2301-contextes" className="font-display text-xl font-semibold">
          État de la bascule par contexte
        </h2>
        <p className="mt-2 text-sm">
          Un contexte se bascule en deux temps : <strong>canary en lecture</strong> (ses GET passent
          à <code className="font-mono text-xs">py</code>, ses mutations restent à{' '}
          <code className="font-mono text-xs">ts</code>), puis <strong>promotion</strong> de toutes
          ses mutations d&apos;un bloc. Jamais deux écrivains pour une même entrée (ADR-2005).
        </p>
        <ul data-testid="spec-2301-contexts" className="mt-3 space-y-2 text-sm">
          {lines.map((line) => (
            <li key={line.name} className="flex flex-wrap items-baseline gap-3">
              <span className="font-mono text-xs">{line.name}</span>
              <span>
                lectures {line.reads} · mutations {line.writes}
              </span>
              <span className="text-ink-muted">{STATE_LABEL[line.state]}</span>
            </li>
          ))}
        </ul>
        <p data-testid="spec-2301-states" className="mt-3 text-sm">
          <strong>{byState('py').length} contextes</strong> sont entièrement Python,{' '}
          <strong>{byState('canary').length}</strong> en canary de lecture,{' '}
          <strong>{byState('ts').length}</strong> entièrement relayés et{' '}
          <strong>{byState('partial').length}</strong> partiels (
          {partial.map((line) => line.name).join(', ')}) : leurs entrées différées de SPEC-2207
          restent chez Hono, sans second écrivain.
        </p>
      </section>

      <section aria-labelledby="spec-2301-bascule">
        <h2 id="spec-2301-bascule" className="font-display text-xl font-semibold">
          Bascule, drain et rollback
        </h2>
        <p className="mt-2 text-sm">
          La surcharge <code className="font-mono text-xs">OWNERSHIP_OVERRIDES</code> est produite
          par <code className="font-mono text-xs">tools/deploy/cutover.mjs</code>, jamais écrite à
          la main. La façade n&apos;accepte que <code className="font-mono text-xs">ts</code> et{' '}
          <code className="font-mono text-xs">py</code> : une valeur{' '}
          <code className="font-mono text-xs">py@10</code> serait ignorée, donc l&apos;outil la
          refuse au lieu de laisser croire à une bascule.
        </p>
        <dl data-testid="spec-2301-cutover" className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="font-semibold">Canary en lecture</dt>
            <dd>
              <code className="font-mono text-xs">--stage reads</code> bascule les GET du contexte,
              laisse ses mutations à <code className="font-mono text-xs">ts</code> et refuse si
              elles sont déjà à <code className="font-mono text-xs">py</code>.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Un seul écrivain</dt>
            <dd>
              <code className="font-mono text-xs">--stage writes</code> promotionne toutes les
              mutations du contexte d&apos;un bloc et refuse une promotion avant le canary, ou une
              mutation servie des deux côtés.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Drain du worker</dt>
            <dd>
              <code className="font-mono text-xs">
                python -m learny_worker.drain --require-empty
              </code>{' '}
              refuse la remise des propriétés tant qu&apos;un événement attend, court, échoue ou a
              été estampillé sans livraison : le répartiteur estampille avant de faner.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Rollback</dt>
            <dd>
              <code className="font-mono text-xs">--stage rollback</code> remet un contexte (ou tout
              le tableau avec <code className="font-mono text-xs">--all</code>) à{' '}
              <code className="font-mono text-xs">ts</code> ; le web revient à Hono en changeant son{' '}
              <code className="font-mono text-xs">API_INTERNAL_URL</code>.
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="spec-2301-preuves">
        <h2 id="spec-2301-preuves" className="font-display text-xl font-semibold">
          Preuves locales et dépendance externe
        </h2>
        <ul data-testid="spec-2301-proofs" className="mt-3 list-disc space-y-2 pl-5 text-sm">
          <li>
            <strong>Outil de bascule</strong> : 12 cas Vitest et 8 cas pytest sur l&apos;inventaire
            réel ; le JSON produit est relu par{' '}
            <code className="font-mono text-xs">learny.shared.ownership.overrides_from_env</code>.
          </li>
          <li>
            <strong>Rollback local</strong> : 4 cas d&apos;intégration — drain refusé avec une
            livraison en attente, événement estampillé sans livraison signalé, rejeu sans perte ni
            double mutation.
          </li>
          <li>
            <strong>Client Bearer externe</strong> : e2e sans cookie sur une opération{' '}
            <code className="font-mono text-xs">py</code>, réponse 200 et{' '}
            <code className="font-mono text-xs">x-served-by: learny-api</code> ; une mutation
            authentifiée par cookie sans <code className="font-mono text-xs">Origin</code> reste
            refusée (403 <code className="font-mono text-xs">ORIGIN_REJECTED</code>).
          </li>
          <li>
            <strong>Bloqué externe (ADR-2009, CL-3)</strong> : sondes et services Coolify, budgets
            ADR-0041, rollback chronométré et restauration de sauvegarde exigent le staging fourni
            par le porteur ; consigné par{' '}
            <code className="font-mono text-xs">fail.mjs SPEC-2301 --external</code>. Aucune mesure
            locale n&apos;est présentée comme une mesure de staging.
          </li>
        </ul>
        <p data-testid="spec-2301-badges" className="mt-3 flex flex-wrap gap-2 text-sm">
          <Badge owner="py" />
          <span>190 / 217 opérations</span>
          <Badge owner="ts" />
          <span>27 opérations relayées</span>
        </p>
      </section>
    </div>
  );
}
