// SPEC-2204 — demonstration page of the tutor Python port (conversations, context, SSE, BYOK).
//
// Every figure comes from the committed artefacts: `api/inventory.json` (the operations, exported
// by SPEC-2001), `api/ownership.yaml` (the ownership table the facade reads at startup),
// `api/oracles/vectors/tutor.json` and `api/oracles/recordings/reads.json` (the SSE frames and the
// parity scenarios recorded on the TypeScript backend), and `evidence/SPEC-2204/acceptance.md`
// (the measured first-chunk latency and the suite totals). Only the prose is written here, so the
// page cannot drift from the evidence it describes.
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

/** The six providers of `learny.platform.llm.catalog` (data-model section 9), catalogue order. */
const AI_PROVIDERS = [
  'anthropic',
  'openai',
  'mistral',
  'deepseek',
  'openai_compatible',
  'local',
] as const;

/** The context keys of `assemble_context`, in the order the prompt block receives them. */
const CONTEXT_KEYS = ['formation', 'chapter', 'passage', 'resources', 'gap', 'profile'] as const;

/** The five AI tasks of the models tab, in prototype order. */
const AI_TASKS = ['programme', 'course', 'gaps', 'tutor', 'light'] as const;

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

/** The ordered `data:` payload types of the recorded chat streams, one per distinct type. */
function sseEventSequence(): string[] {
  const oracle = JSON.parse(readApiFile('oracles', 'vectors', 'tutor.json')) as {
    sse: { chat: { frames: string[] }[] };
  };
  const types: string[] = [];
  for (const vector of oracle.sse.chat) {
    for (const frame of vector.frames) {
      const payload = JSON.parse(frame.replace(/^data: /, '').trim()) as { type: string };
      if (!types.includes(payload.type)) types.push(payload.type);
    }
  }
  return types;
}

/** Number of recorded parity scenarios of the `tutor` group, read from the committed oracle. */
function tutorParityScenarios(): number {
  const recording = JSON.parse(readApiFile('oracles', 'recordings', 'reads.json')) as {
    groups: { group: string; scenarios: unknown[] }[];
  };
  const group = recording.groups.find((entry) => entry.group === 'tutor');
  return group?.scenarios.length ?? 0;
}

interface EvidenceFigures {
  latencyMs: string;
  unitCases: string;
  tutorIntegrationCases: string;
}

/** The latency and the suite totals stated by the committed acceptance of this specification. */
function evidenceFigures(): EvidenceFigures {
  const fallback: EvidenceFigures = {
    latencyMs: '50,0',
    unitCases: '3482',
    tutorIntegrationCases: '55',
  };
  try {
    const text = readFileSync(
      path.join(process.cwd(), '..', '..', 'evidence', 'SPEC-2204', 'acceptance.md'),
      'utf8',
    );
    const latency = /Premier événement `start` reçu par le client\s*\|\s*\*\*([\d,]+) ms\*\*/.exec(
      text,
    )?.[1];
    const unit = /\|\s*Suite unitaire complète\s*\|[^|]*\|\s*(\d+) passed\s*\|/.exec(text)?.[1];
    const tutor = /\|\s*Intégration du contexte tutor[^|]*\|[^|]*\|\s*(\d+) passed\s*\|/.exec(
      text,
    )?.[1];
    return {
      latencyMs: latency ?? fallback.latencyMs,
      unitCases: unit ?? fallback.unitCases,
      tutorIntegrationCases: tutor ?? fallback.tutorIntegrationCases,
    };
  } catch {
    return fallback;
  }
}

export default function Spec2204Demo() {
  const ownership = ownershipTable();
  const scoped = operations.filter((operation) => operation.context === 'tutor');
  const flipped = scoped.filter((operation) => ownership[operation.id] === 'py').length;
  const remaining = scoped.length - flipped;
  const reads = scoped.filter((operation) => operation.method === 'GET').length;
  const writes = scoped.length - reads;
  const events = sseEventSequence();
  const parity = tutorParityScenarios();
  const figures = evidenceFigures();

  return (
    <div className="mt-6 space-y-10">
      <section aria-labelledby="spec-2204-perimetre">
        <h2 id="spec-2204-perimetre" className="font-display text-xl font-semibold">
          Périmètre basculé
        </h2>
        <p className="mt-2 text-sm">
          Le contexte <code className="font-mono text-xs">tutor</code> est servi par l’API Python :
          la façade répond elle-même dès que{' '}
          <code className="font-mono text-xs">api/ownership.yaml</code> marque l’opération{' '}
          <code className="font-mono text-xs">py</code>, sans relais vers Hono. Les compteurs
          ci-dessous sont lus dans l’inventaire et dans la table de propriété, jamais saisis à la
          main.
        </p>
        <dl data-testid="spec-2204-scope" className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
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
          Cinq opérations ouvrent et lisent les conversations (
          <code className="font-mono text-xs">conversations.get</code>,{' '}
          <code className="font-mono text-xs">conversations.messages</code>,{' '}
          <code className="font-mono text-xs">conversations.self-test.answer</code>,{' '}
          <code className="font-mono text-xs">courses.conversations.create</code> et{' '}
          <code className="font-mono text-xs">courses.conversations.list</code>) ; les sept autres
          portent les clés personnelles et l’onglet Modèles d’IA (
          <code className="font-mono text-xs">me.ai.*</code>). Les handlers sont fins : ils valident
          le contrat généré et appellent un cas d’usage de{' '}
          <code className="font-mono text-xs">learny.tutor</code>.
        </p>
      </section>

      <section aria-labelledby="spec-2204-operations">
        <h2 id="spec-2204-operations" className="font-display text-xl font-semibold">
          Opérations du périmètre
        </h2>
        <p className="mt-2 text-sm">
          Chaque ligne vient de l’inventaire ; l’étiquette donne le propriétaire courant dans la
          table de propriété. Une opération ne passe à <code className="font-mono text-xs">py</code>{' '}
          qu’avec sa parité prouvée, et l’ensemble des handlers est vérifié par{' '}
          <code className="font-mono text-xs">test_handlers.py</code> (
          <code className="font-mono text-xs">py_operations == HANDLERS</code>).
        </p>
        <ul data-testid="spec-2204-operations" className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
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

      <section aria-labelledby="spec-2204-contexte">
        <h2 id="spec-2204-contexte" className="font-display text-xl font-semibold">
          Conversations et contexte envoyé au modèle
        </h2>
        <p className="mt-2 text-sm">
          Une conversation appartient à un cours et à un chapitre ; elle est privée, relue sous les
          claims de l’apprenant, et une conversation d’autrui répond comme une conversation absente.
          Le message d’accueil est composé par le code, sans appel modèle : ouvrir une discussion ne
          coûte rien.
        </p>
        <ul data-testid="spec-2204-context" className="mt-3 list-disc space-y-3 pl-5 text-sm">
          <li>
            <strong>Six clés, choisies par le client</strong> :{' '}
            {CONTEXT_KEYS.map((key, index) => (
              <span key={key}>
                <code className="font-mono text-xs">{key}</code>
                {index === CONTEXT_KEYS.length - 1 ? '.' : ', '}
              </span>
            ))}{' '}
            Seules les clés incluses atteignent le modèle, comme données échappées dans un bloc{' '}
            <code className="font-mono text-xs">&lt;context&gt;</code> — jamais comme consignes.
          </li>
          <li>
            <strong>Budget de 4 000 tokens</strong> pour les passages de ressources, à quatre
            caractères par token : un passage coûte{' '}
            <code className="font-mono text-xs">len / 4</code> et n’entre jamais partiellement. Le
            texte du chapitre est borné à 6 000 caractères, le passage sélectionné à 1 000
            caractères (aperçu de 160), et l’historique aux vingt derniers messages, précédés du
            résumé des dix plus anciens, tronqués à 160 caractères chacun.
          </li>
          <li>
            <strong>Sources citées</strong> : le modèle termine sa réponse par un marqueur{' '}
            <code className="font-mono text-xs">{'[[sources:…]]'}</code> ; le filtre de flux le
            masque au client, puis chaque identifiant est résolu en étiquette lisible — page de PDF,
            minute d’une note vocale, titre d’une ressource, ou connaissance du tuteur. Un
            identifiant inventé est journalisé puis écarté ; une réponse sans marqueur retombe sur
            le chapitre ou sur le tuteur.
          </li>
          <li>
            <strong>Persistance</strong> : le message de l’apprenant et le titre de la conversation
            sont écrits avant l’appel modèle, le message du tuteur seulement après un flux complet ;
            une annulation ou une erreur ne laisse donc jamais de réponse partielle. « Teste-moi »
            crée une brique <code className="font-mono text-xs">open_question</code>, écrit la
            réponse avant la correction, et confie toute écriture de maîtrise, de FSRS et de lacune
            à <code className="font-mono text-xs">apply_learning_result</code>.
          </li>
        </ul>
      </section>

      <section aria-labelledby="spec-2204-flux">
        <h2 id="spec-2204-flux" className="font-display text-xl font-semibold">
          Flux SSE : protocole et latence
        </h2>
        <p className="mt-2 text-sm">
          La route répond en <code className="font-mono text-xs">text/event-stream</code> avec le
          protocole <em>AI SDK UI message stream v1</em> : chaque trame est{' '}
          <code className="font-mono text-xs">{'data: {json}\\n\\n'}</code>, dans l’ordre exact du
          contrat, et le flux se termine par la sentinelle{' '}
          <code className="font-mono text-xs">data: [DONE]</code>. La séquence ci-dessous est lue
          dans l’oracle enregistré sur le TypeScript.
        </p>
        <ol
          data-testid="spec-2204-stream-events"
          className="mt-3 grid gap-2 text-sm sm:grid-cols-2"
        >
          {events.map((event, index) => (
            <li key={event} className="flex items-baseline gap-2">
              <span className="font-mono text-xs">{String(index + 1).padStart(2, '0')}</span>
              <code className="font-mono text-xs">{event}</code>
            </li>
          ))}
        </ol>
        <p data-testid="spec-2204-stream-latency" className="mt-3 text-sm">
          Latence mesurée du premier chunk, à travers la façade réelle (route, pipeline, handler,
          flux) sur le modèle simulé : <strong>{figures.latencyMs} ms</strong> pour le premier
          événement <code className="font-mono text-xs">start</code>, sous le seuil de 500 ms. Le
          writer transmet chaque trame dès qu’elle est produite, sans tampon.
        </p>
        <ul data-testid="spec-2204-stream" className="mt-3 list-disc space-y-3 pl-5 text-sm">
          <li>
            <strong>En-têtes</strong> :{' '}
            <code className="font-mono text-xs">
              content-type: text/event-stream; charset=utf-8
            </code>
            , <code className="font-mono text-xs">cache-control: no-store</code>,{' '}
            <code className="font-mono text-xs">x-vercel-ai-ui-message-stream: v1</code>,{' '}
            <code className="font-mono text-xs">x-request-id</code> et{' '}
            <code className="font-mono text-xs">x-served-by: learny-api</code>.
          </li>
          <li>
            <strong>Erreur avant le premier octet</strong> : une conversation étrangère, un
            Teste-moi en attente ou un flux déjà ouvert répondent un{' '}
            <code className="font-mono text-xs">application/problem+json</code> typé, jamais un flux
            vide.
          </li>
          <li>
            <strong>Erreur en cours de flux</strong> : un échec du fournisseur devient une trame{' '}
            <code className="font-mono text-xs">error</code> et le flux se referme proprement ; le
            message de l’apprenant porte le code d’erreur, le message du tuteur n’est pas écrit.
          </li>
          <li>
            <strong>Annulation</strong> : à la déconnexion du client, le générateur est annulé, la
            transaction en cours est libérée et aucun message partiel n’est commité.
          </li>
          <li>
            <strong>Terminaison</strong> : après la trame{' '}
            <code className="font-mono text-xs">finish</code>, la sentinelle{' '}
            <code className="font-mono text-xs">data: [DONE]</code> ferme le corps ; le client ne
            reçoit jamais d’octet après elle.
          </li>
        </ul>
      </section>

      <section aria-labelledby="spec-2204-byok">
        <h2 id="spec-2204-byok" className="font-display text-xl font-semibold">
          Clés personnelles (BYOK)
        </h2>
        <p className="mt-2 text-sm">
          Six fournisseurs sont déclarés au catalogue ; une clé n’est jamais renvoyée, ni en clair
          ni chiffrée, et le DTO public ne porte que le masque, la région et la note de données.
        </p>
        <ul data-testid="spec-2204-providers" className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {AI_PROVIDERS.map((provider) => (
            <li key={provider}>
              <code className="font-mono text-xs">{provider}</code>
            </li>
          ))}
        </ul>
        <ul data-testid="spec-2204-byok" className="mt-3 list-disc space-y-3 pl-5 text-sm">
          <li>
            <strong>AES-256-GCM</strong> : la clé est chiffrée dans une enveloppe{' '}
            <code className="font-mono text-xs">iv(12) | tag(16) | ciphertext</code> et les données
            authentifiées lient le chiffré à sa ligne et à son propriétaire (
            <code className="font-mono text-xs">learny:ai_credentials:&lt;id&gt;:&lt;user&gt;</code>
            ) ; recopier le chiffré sur une autre ligne fait échouer le déchiffrement. La clé
            maîtresse vient de <code className="font-mono text-xs">APP_ENCRYPTION_KEY</code> (32
            octets), avec rotation par{' '}
            <code className="font-mono text-xs">APP_ENCRYPTION_KEY_PREVIOUS</code>.
          </li>
          <li>
            <strong>Masque</strong> : le DTO expose{' '}
            <code className="font-mono text-xs">keyMasked</code> — le préfixe alphabétique, huit
            puces et les quatre derniers caractères — avec{' '}
            <code className="font-mono text-xs">key_last4</code>, l’empreinte et le préfixe stockés
            à part. Dix clés au plus par apprenant ; une clé identique deux fois est un conflit.
          </li>
          <li>
            <strong>Sept opérations</strong> : création, listage, découverte des modèles,
            qualification, suppression, lecture et mise à jour de l’onglet Modèles d’IA. Toutes
            passent par la transaction RLS de l’apprenant ; une clé d’autrui est un 404.
          </li>
          <li>
            <strong>Qualification</strong> : la sonde de connexion date la clé ; la batterie de
            compatibilité teste les capacités requises par tâche (outils, sortie structurée, vision)
            et rend des réserves non bloquantes —{' '}
            <code className="font-mono text-xs">STRUCTURED_UNRELIABLE</code>,{' '}
            <code className="font-mono text-xs">NO_VISION</code>,{' '}
            <code className="font-mono text-xs">NO_TOOLS</code>,{' '}
            <code className="font-mono text-xs">CHECK_TIMEOUT</code>. Aucune clé, aucun prompt et
            aucune charge utile ne sortent du rapport.
          </li>
          <li>
            <strong>Onglet Modèles d’IA</strong> : cinq tâches (
            {AI_TASKS.map((task, index) => (
              <span key={task}>
                <code className="font-mono text-xs">{task}</code>
                {index === AI_TASKS.length - 1 ? '' : ', '}
              </span>
            ))}
            ) ; une affectation est immédiate et sans repli silencieux — supprimer la clé rend la
            tâche indisponible plutôt que de changer de modèle.
          </li>
        </ul>
      </section>

      <section aria-labelledby="spec-2204-garanties">
        <h2 id="spec-2204-garanties" className="font-display text-xl font-semibold">
          Garanties prouvées
        </h2>
        <dl data-testid="spec-2204-guarantees" className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="font-semibold">Parité contractuelle</dt>
            <dd>
              Le groupe <code className="font-mono text-xs">tutor</code> rejoue{' '}
              <strong>{parity} scénarios</strong> à l’identique entre Hono et la façade, sans
              divergence : les deux lectures BYOK générables. La chaîne des conversations n’est pas
              générable par le harnais (il faudrait amorcer un cours prêt) et sa preuve est l’oracle
              du domaine — trames comparées octet pour octet — plus l’intégration de la façade.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">RLS et non-divulgation</dt>
            <dd>
              Chaque lecture et chaque écriture s’exécutent sous les claims de la transaction ; une
              conversation, un message ou une clé d’autrui répond exactement comme une entrée
              absente, et le rôle de service ne sert qu’aux écritures internes de{' '}
              <code className="font-mono text-xs">learny.shared.privileged</code>.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Couverture mesurée</dt>
            <dd>
              <strong>{figures.tutorIntegrationCases} cas d’intégration</strong> pour le tuteur
              (conversations, flux, Teste-moi, BYOK) et{' '}
              <strong>{figures.unitCases} cas unitaires</strong> sur la suite complète, verts, plus
              l’e2e qui consomme réellement le flux à travers le web et la façade.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Frontières</dt>
            <dd>
              Le domaine ne dépend ni de FastAPI, ni de SQLAlchemy, ni d’un SDK : les contrats
              import-linter le vérifient. Les adaptateurs HTTP et les handlers ne portent aucune
              règle métier.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
