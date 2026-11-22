// SPEC-2203 — demonstration page of the content, retrieval and ingestion Python port.
//
// Every figure comes from the committed artefacts: `api/inventory.json` (the operations, exported
// by SPEC-2001) and `api/ownership.yaml` (the ownership table the facade reads at startup). The
// counters are therefore impossible to drift from the evidence; only the prose is written here.
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

export default function Spec2203Demo() {
  const ownership = ownershipTable();
  const scoped = operations.filter((operation) => operation.context === 'content');
  const flipped = scoped.filter((operation) => ownership[operation.id] === 'py').length;
  const remaining = scoped.length - flipped;
  const reads = scoped.filter((operation) => operation.method === 'GET').length;
  const writes = scoped.length - reads;

  return (
    <div className="mt-6 space-y-10">
      <section aria-labelledby="spec-2203-perimetre">
        <h2 id="spec-2203-perimetre" className="font-display text-xl font-semibold">
          Périmètre basculé
        </h2>
        <p className="mt-2 text-sm">
          Le contexte <code className="font-mono text-xs">content</code> est servi par l’API Python
          : la façade répond elle-même dès que{' '}
          <code className="font-mono text-xs">api/ownership.yaml</code> marque l’opération{' '}
          <code className="font-mono text-xs">py</code>, sans relais vers Hono. Les compteurs
          ci-dessous sont lus dans l’inventaire et dans la table de propriété, jamais saisis à la
          main.
        </p>
        <dl data-testid="spec-2203-scope" className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-sm">Opérations du périmètre</dt>
            <dd className="text-2xl font-semibold">{scoped.length}</dd>
          </div>
          <div>
            <dt className="text-sm">Servies par Python</dt>
            <dd className="text-2xl font-semibold">{flipped}</dd>
          </div>
          <div>
            <dt className="text-sm">Encore relayées à Hono</dt>
            <dd className="text-2xl font-semibold">{remaining}</dd>
          </div>
          <div>
            <dt className="text-sm">Lectures / écritures</dt>
            <dd className="text-2xl font-semibold">
              {reads} / {writes}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-sm">
          {reads} opérations sont des lectures, dont{' '}
          <code className="font-mono text-xs">modules.screen</code>,{' '}
          <code className="font-mono text-xs">modules.course</code> et{' '}
          <code className="font-mono text-xs">resources.readUrl</code> ; les {writes} autres sont
          des mutations (<code className="font-mono text-xs">POST</code>,{' '}
          <code className="font-mono text-xs">PUT</code>,{' '}
          <code className="font-mono text-xs">PATCH</code>,{' '}
          <code className="font-mono text-xs">DELETE</code>).
        </p>
      </section>

      <section aria-labelledby="spec-2203-operations">
        <h2 id="spec-2203-operations" className="font-display text-xl font-semibold">
          Opérations du périmètre
        </h2>
        <p className="mt-2 text-sm">
          Chaque ligne vient de l’inventaire ; l’étiquette donne le propriétaire courant dans la
          table de propriété. Un handler ne contient aucune règle : il valide le contrat généré et
          appelle un cas d’usage de <code className="font-mono text-xs">learny.content</code>.
        </p>
        <ul data-testid="spec-2203-operations" className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
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

      <section aria-labelledby="spec-2203-ingestion">
        <h2 id="spec-2203-ingestion" className="font-display text-xl font-semibold">
          Ingestion
        </h2>
        <p className="mt-2 text-sm">
          Un apport entre par le chapitre, puis le worker le traite comme un cas d’usage reprenable
          : chaque étage relit l’état persisté et ne refait que le travail restant.
        </p>
        <ul data-testid="spec-2203-ingestion" className="mt-3 list-disc space-y-3 pl-5 text-sm">
          <li>
            <strong>Types acceptés</strong> : <code className="font-mono text-xs">note</code>,{' '}
            <code className="font-mono text-xs">pdf</code>,{' '}
            <code className="font-mono text-xs">image</code>,{' '}
            <code className="font-mono text-xs">web</code> et{' '}
            <code className="font-mono text-xs">youtube</code>. Le type est vérifié contre les
            octets réellement envoyés, pas contre l’en-tête déclaré.
          </li>
          <li>
            <strong>
              <code className="font-mono text-xs">safe_fetch</code> et ses gardes
            </strong>{' '}
            : une seule résolution DNS par saut, adresse publique imposée (aucune plage privée,
            boucle locale, lien-local ni suffixe interne), ports 80 et 443 seulement, connexion
            épinglée sur l’adresse vérifiée, redirections re-vérifiées une à une (cinq au plus),
            corps lu en flux borné à 5 Mio, délai total de 15 s,{' '}
            <code className="font-mono text-xs">robots.txt</code> honoré pour{' '}
            <code className="font-mono text-xs">LearnyBot</code> et mis en cache 24 h.
          </li>
          <li>
            <strong>
              <code className="font-mono text-xs">process_resource</code> reprenable
            </strong>{' '}
            : cinq étages durables — <code className="font-mono text-xs">load</code>,{' '}
            <code className="font-mono text-xs">extract</code>,{' '}
            <code className="font-mono text-xs">chunk</code>,{' '}
            <code className="font-mono text-xs">embed</code>,{' '}
            <code className="font-mono text-xs">finalize</code>. La finalisation remplace les
            passages précédents en une seule transaction : un échec ne laisse jamais un ensemble
            partiel, une livraison en double trouve le marqueur et ne fait rien, une panne
            transitoire laisse la ressource <code className="font-mono text-xs">processing</code>{' '}
            pour la tentative suivante, un échec permanent la termine en{' '}
            <code className="font-mono text-xs">failed</code> avec un code lisible.
          </li>
          <li>
            <strong>Extracteurs</strong> : PDF.js remplacé par{' '}
            <code className="font-mono text-xs">pypdf</code>, Readability par{' '}
            <code className="font-mono text-xs">readability-lxml</code>, transcriptions YouTube par{' '}
            <code className="font-mono text-xs">youtube-transcript-api</code> ; à lecture mockée
            égale, les pages, passages et ancrages des fixtures sont identiques.
          </li>
        </ul>
      </section>

      <section aria-labelledby="spec-2203-retrieval">
        <h2 id="spec-2203-retrieval" className="font-display text-xl font-semibold">
          Découpage, embeddings et recherche
        </h2>
        <p className="mt-2 text-sm">
          Le découpage et les vecteurs sont déterministes : les mêmes entrées produisent les mêmes
          passages et les mêmes scores, sans réseau en mode{' '}
          <code className="font-mono text-xs">mock</code>.
        </p>
        <ul data-testid="spec-2203-retrieval" className="mt-3 list-disc space-y-3 pl-5 text-sm">
          <li>
            <strong>Découpage</strong> : cible de 800 tokens, recouvrement de 100 tokens, quatre
            caractères par token. Un passage ne franchit jamais une frontière de source (une page de
            PDF) et conserve ses bornes exactes{' '}
            <code className="font-mono text-xs">{'{charStart, charEnd}'}</code> ainsi que l’ancrage,
            la page ou l’instant vidéo d’origine.
          </li>
          <li>
            <strong>Embeddings</strong> : <code className="font-mono text-xs">voyage-4-lite</code>{' '}
            in vivo, lots de 64, 1024 dimensions vérifiées avant écriture. En mode{' '}
            <code className="font-mono text-xs">mock</code>, le vecteur unitaire déterministe est
            dérivé de blocs SHA-256 du texte.
          </li>
          <li>
            <strong>
              <code className="font-mono text-xs">search_user_content</code>
            </strong>{' '}
            : la recherche s’exécute sous les claims de la transaction (RLS), le texte normalisé est
            passé en paramètre lié et l’ordre est stable (score puis identifiant).
          </li>
          <li>
            <strong>Sélection du contexte</strong> : budgets par tâche — programme 6 000, cours 24
            000, lacunes 8 000, tuteur 4 000 tokens —, tri par score décroissant puis par source,
            position et identifiant de passage ; les doublons et les recouvrements supérieurs à 80 %
            sont écartés, et un passage ne rentre jamais partiellement.
          </li>
          <li>
            <strong>Plateformes</strong> : Voyage AI pour les embeddings et Tavily pour la recherche
            web de repli, appelées côté serveur avec{' '}
            <code className="font-mono text-xs">httpx</code> ; une clé absente est une
            indisponibilité explicite, jamais un repli silencieux.
          </li>
        </ul>
      </section>

      <section aria-labelledby="spec-2203-garanties">
        <h2 id="spec-2203-garanties" className="font-display text-xl font-semibold">
          Garanties prouvées
        </h2>
        <dl data-testid="spec-2203-guarantees" className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="font-semibold">RLS</dt>
            <dd>
              Chaque requête utilisateur s’exécute sous les claims de la transaction et le rôle de
              service n’est utilisé que par{' '}
              <code className="font-mono text-xs">learny.shared.privileged</code> ; un apport, un
              module ou une citation d’autrui répond exactement comme une entrée absente, et les
              tests d’intégration vérifient l’isolation avant toute réponse.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Un seul effet par événement</dt>
            <dd>
              Les événements d’ingestion sont écrits dans{' '}
              <code className="font-mono text-xs">public.event_outbox</code> dans la transaction
              métier, avec des identifiants stables —{' '}
              <code className="font-mono text-xs">resource-uploaded:&lt;rid&gt;</code>,{' '}
              <code className="font-mono text-xs">resource/ready</code> — et des marqueurs dédiés ;
              un rejeu ne produit ni second effet ni second événement.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Contrats et frontières</dt>
            <dd>
              Le contrat HTTP est celui des modèles générés depuis OpenAPI : même statut, même corps
              et mêmes codes d’erreur que le backend TypeScript. Les contrats import-linter
              interdisent au domaine de dépendre de FastAPI, SQLAlchemy ou des SDK ; les adaptateurs
              sortants vivent dans <code className="font-mono text-xs">learny.platform</code> et ne
              portent aucune règle métier.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
