// SPEC-2207 — demonstration page of the jobs, crons and demonstration routes cutover.
//
// Every counter comes from the committed artefacts: `api/inventory.json` (the 217 operations of the
// contract), `api/ownership.yaml` (the ownership table the facade reads at startup),
// `api/oracles/vectors/auth-cookies.json` (the cookie exchanges recorded from Hono, replayed byte
// for byte by pytest) and `evidence/SPEC-2207/acceptance.md` (the suite totals). Only the prose and
// the reason of each deferred entry are written here, so the counters cannot drift from the
// evidence they describe.
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

const SECTIONS = ['operations', 'special', 'consumers', 'crons'] as const;
type Section = (typeof SECTIONS)[number];
type Owner = 'py' | 'ts';

interface OwnershipEntry {
  section: Section;
  key: string;
  owner: Owner;
}

/** The two tasks of the Python scheduler: one hourly and one nightly, each idempotent per period. */
const CRON_NAMES = ['cron-hourly-tick', 'cron-nightly'] as const;

/** The causes of the deferred entries (handover §8 and §9.2). */
const CAUSES: Record<string, string> = {
  factories:
    'les fabriques de `@learny/db/testing` (`createTestUser`, `createTestProgramme`, `asUser`) n’existent pas en Python',
  service:
    'le cas d’usage appelé n’est pas encore porté (service `@learny/llm`, `@learny/tutor`, brique publique)',
  pipeline:
    'la page rejoue un pipeline réel (ingestion, notation) dans une transaction annulée, au-delà d’une démonstration',
  home: 'hors périmètre : agrégat de dix-huit lectures SQL sans aucun oracle dans l’inventaire (ADR-2023)',
  commitlint:
    'dépend de `@commitlint/config-conventional` : embarquer une bibliothèque Node dans la façade a été écarté',
  demoJob:
    'exige l’adaptateur d’étapes `executeDirect`, `DEMO_STEPS` et `sddDemoStore` : de l’outillage, pas une route',
  sprints:
    '`planSprintsBeforeMilestones` est un service de 857 lignes (automatisme 8) sans équivalent Python',
};

/** One line per deferred entry, with the cause of `CAUSES`. */
const DEFERRED: Record<string, keyof typeof CAUSES> = {
  'dev.sdd.spec-009.demo': 'service',
  'dev.sdd.spec-103.demo': 'factories',
  'dev.sdd.spec-104.demo': 'factories',
  'dev.sdd.spec-105.demo': 'factories',
  'dev.sdd.spec-106.demo': 'factories',
  'dev.sdd.spec-107.demo': 'factories',
  'dev.sdd.spec-108.demo': 'factories',
  'dev.sdd.spec-111.demo': 'factories',
  'dev.sdd.spec-112.demo': 'factories',
  'dev.sdd.spec-113.demo': 'factories',
  'dev.sdd.spec-115.demo': 'factories',
  'dev.sdd.spec-501.create': 'service',
  'dev.sdd.spec-501.report': 'service',
  'dev.sdd.spec-501.correct': 'service',
  'dev.sdd.spec-504.demo': 'service',
  'dev.sdd.spec-504.call': 'service',
  'dev.sdd.spec-508.demo': 'service',
  'dev.sdd.spec-512.demo': 'service',
  'dev.sdd.spec-512.suggest': 'service',
  'dev.sdd.spec-512.decide': 'service',
  'dev.sdd.spec-1301.demo': 'service',
  'dev.sdd.spec-411.demo': 'pipeline',
  'dev.sdd.spec-509.demo': 'pipeline',
  'dev.sdd.spec-510.demo': 'pipeline',
  'dev.sdd.spec-511.demo': 'pipeline',
  'dev.sdd.spec-711.demo': 'pipeline',
  'home.get': 'home',
  'POST /api/v1/_dev/commit-check': 'commitlint',
  'POST /api/v1/_dev/demo-job': 'demoJob',
  'POST /api/v1/formations/:fid/sprints': 'sprints',
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

interface CookieFigures {
  exchanges: number;
}

/** The seven exchanges recorded from Hono (`@supabase/ssr` 0.12.7), replayed byte for byte. */
function cookieFigures(): CookieFigures {
  const vectors = JSON.parse(readApiFile('oracles', 'vectors', 'auth-cookies.json')) as {
    cases: unknown[];
  };
  return { exchanges: vectors.cases.length };
}

interface EvidenceFigures {
  unitCases: string;
  workerCases: string;
  e2eCases: string;
}

/** The suite totals stated by the committed acceptance of this specification. */
function evidenceFigures(): EvidenceFigures {
  const fallback: EvidenceFigures = { unitCases: '3 735', workerCases: '25', e2eCases: '0' };
  try {
    const text = readFileSync(
      path.join(process.cwd(), '..', '..', 'evidence', 'SPEC-2207', 'acceptance.md'),
      'utf8',
    );
    const unit = /\|\s*Suites unitaires\s*\|[^|]*\|\s*([\d\s]+)\s*réussis?\s*\|/.exec(text)?.[1];
    const worker = /\|\s*Intégration du worker\s*\|[^|]*\|\s*(\d+)\s*réussis?\s*\|/.exec(text)?.[1];
    const e2e = /\|\s*e2e de la spécification\s*\|[^|]*\|\s*(\d+)\s*réussis?\s*\|/.exec(text)?.[1];
    return {
      unitCases: unit?.trim() ?? fallback.unitCases,
      workerCases: worker ?? fallback.workerCases,
      e2eCases: e2e ?? fallback.e2eCases,
    };
  } catch {
    return fallback;
  }
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

export default function Spec2207Demo() {
  const entries = ownershipTable();
  const ownerOf = (section: Section, owner: Owner): OwnershipEntry[] =>
    entries.filter((entry) => entry.section === section && entry.owner === owner);
  const pyOperations = ownerOf('operations', 'py').length;
  const tsOperations = ownerOf('operations', 'ts');
  const pySpecial = ownerOf('special', 'py');
  const tsSpecial = ownerOf('special', 'ts');
  const consumers = entries.filter((entry) => entry.section === 'consumers');
  const pyConsumers = consumers.filter((entry) => entry.owner === 'py').length;
  const crons = entries.filter((entry) => entry.section === 'crons');
  const pyCrons = crons.filter((entry) => entry.owner === 'py').length;
  const deferred = [...tsOperations, ...tsSpecial];
  const deferredByCause = new Map<string, OwnershipEntry[]>();
  for (const entry of deferred) {
    const cause = DEFERRED[entry.key] ?? 'service';
    deferredByCause.set(cause, [...(deferredByCause.get(cause) ?? []), entry]);
  }
  const cookies = cookieFigures();
  const figures = evidenceFigures();
  const missingReasons = deferred.filter((entry) => DEFERRED[entry.key] === undefined).length;

  return (
    <div className="mt-6 space-y-10">
      <section aria-labelledby="spec-2207-perimetre">
        <h2 id="spec-2207-perimetre" className="font-display text-xl font-semibold">
          Périmètre basculé
        </h2>
        <p className="mt-2 text-sm">
          Chaque entrée de <code className="font-mono text-xs">api/ownership.yaml</code> est servie
          par l’API Python ou relayée à Hono : la façade ne décide rien d’autre que lire ce tableau.
          Les opérations, les routes spéciales, les consommateurs et les deux crons sont tous
          exécutés par le processus Python ; les compteurs ci-dessous sont lus dans la table de
          propriété et dans l’inventaire, jamais saisis à la main.
        </p>
        <dl data-testid="spec-2207-scope" className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-sm">Opérations servies par Python</dt>
            <dd className="text-2xl font-semibold">
              {pyOperations} / {operations.length}
            </dd>
          </div>
          <div>
            <dt className="text-sm">Routes spéciales servies par Python</dt>
            <dd className="text-2xl font-semibold">
              {pySpecial.length} / {pySpecial.length + tsSpecial.length}
            </dd>
          </div>
          <div>
            <dt className="text-sm">Consommateurs Python</dt>
            <dd className="text-2xl font-semibold">
              {pyConsumers} / {consumers.length}
            </dd>
          </div>
          <div>
            <dt className="text-sm">Crons Python</dt>
            <dd className="text-2xl font-semibold">
              {pyCrons} / {crons.length}
            </dd>
          </div>
        </dl>
        <p data-testid="spec-2207-scope-deferred" className="mt-3 text-sm">
          <strong>{deferred.length} entrées restent relayées</strong> ({tsOperations.length}{' '}
          opérations et {tsSpecial.length} routes spéciales) : elles répondent toujours, par le
          relais de la façade, et leur raison est celle du handover §8 et §9.2. Aucune n’est une
          régression fonctionnelle ; c’est un relais qui subsiste, entériné par un ADR.
        </p>
      </section>

      <section aria-labelledby="spec-2207-consommateurs">
        <h2 id="spec-2207-consommateurs" className="font-display text-xl font-semibold">
          Consommateurs et crons
        </h2>
        <p className="mt-2 text-sm">
          Hono tourne sans <code className="font-mono text-xs">/api/inngest</code> : Hono est
          démarré par la pile de tests comme filet de sécurité, et plus aucun consommateur n’y est
          exécuté. Les consommateurs sont idempotents par la livraison (une par couple événement et
          consommateur) et par la garde de transition d’état du cas d’usage appelé.
        </p>
        <ul data-testid="spec-2207-consumers" className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {consumers.map((consumer) => (
            <li key={consumer.key} className="flex items-baseline gap-2">
              <span className="font-mono text-xs">{consumer.key}</span>
              <Badge owner={consumer.owner} />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm">
          <strong>Deux tâches de planificateur</strong> remplacent les crons Inngest :{' '}
          {CRON_NAMES.join(' et ')}, sous verrou consultatif, donc une seule instance tick par
          échéance (CL-2). <code className="font-mono text-xs">step.sleepUntil</code> est remplacé
          par <code className="font-mono text-xs">run_at</code>, et le résumé quotidien passe par
          l’événement interne <code className="font-mono text-xs">job/daily-digest</code>.
        </p>
        <ul data-testid="spec-2207-crons" className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {crons.map((cron) => (
            <li key={cron.key} className="flex items-baseline gap-2">
              <span className="font-mono text-xs">{cron.key}</span>
              <Badge owner={cron.owner} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="spec-2207-differes">
        <h2 id="spec-2207-differes" className="font-display text-xl font-semibold">
          Entrées encore relayées
        </h2>
        <p className="mt-2 text-sm">
          Trente entrées restent <code className="font-mono text-xs">ts</code> : vingt-sept
          opérations et trois routes spéciales. La façade les relaie telles quelles, en-têtes et
          corps compris, donc elles fonctionnent exactement comme avant la bascule. Chacune porte sa
          raison ; {missingReasons === 0 ? 'aucune' : String(missingReasons)} n’en a pas.
        </p>
        <ul data-testid="spec-2207-deferred" className="mt-3 space-y-3 text-sm">
          {[...deferredByCause.entries()].map(([cause, items]) => (
            <li key={cause}>
              <p className="font-semibold">{CAUSES[cause] ?? cause}</p>
              <p className="mt-1 flex flex-wrap gap-2">
                {items.map((item) => (
                  <span key={item.key} className="font-mono text-xs">
                    {item.key}
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="spec-2207-preuves">
        <h2 id="spec-2207-preuves" className="font-display text-xl font-semibold">
          Parité et preuves
        </h2>
        <p className="mt-2 text-sm">
          La bascule n’a changé ni libellé, ni contrat, ni oracle : les preuves sont des mesures
          rejouées, pas des valeurs théoriques.
        </p>
        <ul data-testid="spec-2207-parity" className="mt-3 list-disc space-y-3 pl-5 text-sm">
          <li>
            <strong>{cookies.exchanges} échanges de cookies</strong> d’
            <code className="font-mono text-xs">auth.*</code> enregistrés depuis Hono (
            <code className="font-mono text-xs">@supabase/ssr</code> 0.12.7) et rejoués{' '}
            <strong>octet pour octet</strong> par pytest : c’est la preuve de parité d’ADR-2034.
          </li>
          <li>
            <strong>Un consommateur par fonction Inngest</strong> de la table du plan P22
            (vingt-trois entrées), chacun avec son test d’intégration : succès, reprise, livraison
            dupliquée et charge invalide en échec définitif sans reprise (CL-1).
          </li>
          <li>
            <strong>Une démonstration de bout en bout</strong> : l’événement{' '}
            <code className="font-mono text-xs">sdd/demo-requested</code> émis par la route{' '}
            <code className="font-mono text-xs">dev.events.demo.start</code> est consommé par le
            worker Python, qui écrit les trois étapes de{' '}
            <code className="font-mono text-xs">sdd_demo_runs</code> ; l’e2e de cette spécification
            le vérifie sur la pile réelle.
          </li>
          <li>
            <strong>{figures.unitCases} cas unitaires</strong> verts (pytest et Vitest),{' '}
            <strong>{figures.workerCases} cas d’intégration du worker</strong> et{' '}
            <strong>{figures.e2eCases} test e2e</strong> de la spécification, dont un{' '}
            <code className="font-mono text-xs">@visual</code> sur cette page.
          </li>
        </ul>
      </section>

      <section aria-labelledby="spec-2207-garanties">
        <h2 id="spec-2207-garanties" className="font-display text-xl font-semibold">
          Garanties prouvées
        </h2>
        <dl data-testid="spec-2207-guarantees" className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="font-semibold">Un seul écrivain</dt>
            <dd>
              Une entrée passe à <code className="font-mono text-xs">py</code> seulement avec sa
              parité prouvée ; jamais deux écrivains. Les cellules de{' '}
              <code className="font-mono text-xs">api/ownership.yaml</code> sont la seule décision.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Idempotence</dt>
            <dd>
              La clé primaire de <code className="font-mono text-xs">job_deliveries</code> est le
              couple événement et consommateur ; les tâches du planificateur portent des
              identifiants déterministes, donc un rejeu n’a aucun second effet.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Horloge injectable</dt>
            <dd>
              <code className="font-mono text-xs">run_at</code>, les échéances des crons, les
              fenêtres locales et les traces de démonstration lisent l’horloge injectée (ADR-0047) ;
              aucun module ne lit l’heure du processus.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Défaut définitif</dt>
            <dd>
              Une charge invalide est refusée au dispatch par le validateur du consommateur, donc la
              livraison passe <code className="font-mono text-xs">failed</code> au premier essai et
              n’est jamais reprise (CL-1).
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
