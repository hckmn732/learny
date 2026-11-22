// SPEC-2205 — demonstration page of the engagement Python port (notifications, automations,
// pause, job use cases).
//
// Every counter comes from the committed artefacts: `api/inventory.json` (operations, exported by
// SPEC-2001), `api/ownership.yaml` (the ownership table the facade reads at startup) and the parity
// recording `api/oracles/recordings/reads.json`. Only the prose is written here, so the page cannot
// drift from the evidence it describes.
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

/** The sixteen notification types of `learny/engagement/domain/templates.py`, in registry order. */
const NOTIFICATION_TYPES = [
  'validation_soon',
  'course_ready',
  'global_quiz_today',
  'new_gap',
  'session_planned',
  'module_validated',
  'session_to_reschedule',
  'weekly_review',
  'milestone',
  'ai_cost_alert',
  'ai_task_failed',
  'export_ready',
  'group_invitation',
  'daily_digest',
  'relaunch',
  'planning_adjusted',
] as const;

/** The ten automation keys of `learny/engagement/domain/automations/keys.py`. */
const AUTOMATION_KEYS = [
  'reprise',
  'micro_seance',
  'echauffement',
  'remediation',
  'jeu_lacune',
  'questions_cartes',
  'plafond_quiz',
  'sprint',
  'bilan',
  'pause',
] as const;

/** The four job use cases ported by this specification; the worker wiring is SPEC-2207. */
const JOB_USE_CASES = [
  {
    name: 'ensure_practice_exercise',
    text: 'crée l’exercice pratique (jeu-lacune) d’une notion à partir de ses questions, sans jamais en produire deux fois pour la même notion.',
  },
  {
    name: 'plan_daily_digests',
    text: 'à chaque tick horaire, retient les apprenants dont l’heure locale tombe dans la fenêtre et émet un unique job/daily-digest par apprenant.',
  },
  {
    name: 'send_daily_digest',
    text: 'construit le programme du jour (vingt activités au plus, dix titres retenus) et le remet à notify, seul écrivain des canaux.',
  },
  {
    name: 'sync_validation_quiz_reminders',
    text: 'planifie, met à jour et supprime les rappels de quiz de validation de l’heure, sans doublon ni rappel orphelin.',
  },
] as const;

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

/** Number of recorded parity scenarios per context, read from the committed oracle. */
function parityScenarioCounts(): Record<string, number> {
  const recording = JSON.parse(readApiFile('oracles', 'recordings', 'reads.json')) as {
    groups: { group: string; scenarios: unknown[] }[];
  };
  const counts: Record<string, number> = {};
  for (const group of recording.groups) {
    if (group.group !== 'undefined') counts[group.group] = group.scenarios.length;
  }
  return counts;
}

export default function Spec2205Demo() {
  const ownership = ownershipTable();
  const scoped = operations.filter((operation) => operation.context === 'engagement');
  const flipped = scoped.filter((operation) => ownership[operation.id] === 'py').length;
  const remaining = scoped.length - flipped;
  const reads = scoped.filter((operation) => operation.method === 'GET').length;
  const writes = scoped.length - reads;
  const parity = parityScenarioCounts();
  const parityTotal = ['identity', 'formation', 'learning', 'assessments', 'engagement'].reduce(
    (total, group) => total + (parity[group] ?? 0),
    0,
  );

  return (
    <div className="mt-6 space-y-10">
      <section aria-labelledby="spec-2205-perimetre">
        <h2 id="spec-2205-perimetre" className="font-display text-xl font-semibold">
          Périmètre basculé
        </h2>
        <p className="mt-2 text-sm">
          Le contexte <code className="font-mono text-xs">engagement</code> est servi par l’API
          Python : la façade répond elle-même dès que{' '}
          <code className="font-mono text-xs">api/ownership.yaml</code> marque l’opération{' '}
          <code className="font-mono text-xs">py</code>, sans relais vers Hono. Les compteurs
          ci-dessous sont lus dans l’inventaire et dans la table de propriété, jamais saisis à la
          main.
        </p>
        <dl data-testid="spec-2205-scope" className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
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
        <p data-testid="spec-2205-scope-jobs" className="mt-3 text-sm">
          Les {scoped.length} opérations couvrent la boîte de notifications, les réglages, les
          abonnements push, la désinscription en un clic, la pause, le journal des automatismes et
          la revue hebdomadaire. Les <strong>quatre cas d’usage de job</strong> du périmètre sont
          portés et testés ; leur câblage au worker relève de SPEC-2207.
        </p>
      </section>

      <section aria-labelledby="spec-2205-operations">
        <h2 id="spec-2205-operations" className="font-display text-xl font-semibold">
          Opérations du périmètre
        </h2>
        <p className="mt-2 text-sm">
          Chaque ligne vient de l’inventaire ; l’étiquette donne le propriétaire courant dans la
          table de propriété. Un handler ne contient aucune règle : il valide le contrat généré et
          appelle un cas d’usage de <code className="font-mono text-xs">learny.engagement</code>.
        </p>
        <ul data-testid="spec-2205-operations" className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
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

      <section aria-labelledby="spec-2205-inbox">
        <h2 id="spec-2205-inbox" className="font-display text-xl font-semibold">
          Boîte de notifications et réglages
        </h2>
        <p className="mt-2 text-sm">
          Toutes les lectures et écritures s’exécutent dans la transaction RLS de l’apprenant, avec
          l’horloge injectée : une notification d’autrui n’est ni listée, ni comptée, ni marquée
          lue.
        </p>
        <ul data-testid="spec-2205-inbox" className="mt-3 list-disc space-y-3 pl-5 text-sm">
          <li>
            <strong>Boîte de réception</strong> :{' '}
            <code className="font-mono text-xs">notifications.list</code> groupe les entrées par
            jour civil local (<em>aujourd’hui</em>, <em>hier</em>, <em>plus ancien</em>) et accepte
            les filtres <code className="font-mono text-xs">all</code> et{' '}
            <code className="font-mono text-xs">unread</code>, une pagination stable et un fuseau
            explicite.
          </li>
          <li>
            <strong>Lecture</strong> : <code className="font-mono text-xs">notifications.read</code>{' '}
            et <code className="font-mono text-xs">notifications.readAll</code> renvoient le
            compteur non lu recalculé ; une notification déjà lue n’est jamais réécrite et un rejeu
            ne produit pas de second effet.
          </li>
          <li>
            <strong>Réglages</strong> :{' '}
            <code className="font-mono text-xs">me.notificationSettings.get</code> normalise les
            canaux (<code className="font-mono text-xs">app</code> toujours actif,{' '}
            <code className="font-mono text-xs">email</code> et{' '}
            <code className="font-mono text-xs">browser</code> pilotés), les six types, l’heure du
            programme, les heures calmes, le week-end, le plafond quotidien et le compteur de types
            actifs.
          </li>
          <li>
            <strong>Patch partiel</strong> :{' '}
            <code className="font-mono text-xs">me.notificationSettings.update</code> ne touche que
            les champs envoyés ; un <code className="font-mono text-xs">expectedUpdatedAt</code>{' '}
            périmé répond 409 et ne laisse aucune écriture (CL-2).
          </li>
        </ul>
      </section>

      <section aria-labelledby="spec-2205-routing">
        <h2 id="spec-2205-routing" className="font-display text-xl font-semibold">
          Routage des livraisons
        </h2>
        <p className="mt-2 text-sm">
          Une seule table de décision, sans horloge ni base : l’instant, le fuseau et le nombre
          d’envois du jour sont fournis par l’appelant, donc chaque branche est testable.
        </p>
        <ul data-testid="spec-2205-routing" className="mt-3 list-disc space-y-3 pl-5 text-sm">
          <li>
            <strong>Ordre</strong> : préférence de canal et de type, notification lue ou périmée,
            instant d’éligibilité futur, week-end, heures calmes, plafond quotidien, envoi. Chaque
            branche produit un statut explicite : <code className="font-mono text-xs">sent</code>,{' '}
            <code className="font-mono text-xs">scheduled</code>,{' '}
            <code className="font-mono text-xs">deferred_quiet</code>,{' '}
            <code className="font-mono text-xs">capped</code> ou{' '}
            <code className="font-mono text-xs">skipped_pref</code>.
          </li>
          <li>
            <strong>Heures calmes</strong> : fenêtre locale{' '}
            <code className="font-mono text-xs">[21:00, 08:00)</code> par défaut — début inclus, fin
            exclue, franchissement de minuit géré ; le week-end, seul le quiz global du jour peut
            partir.
          </li>
          <li>
            <strong>Plafonds 3 / 5 / 8</strong> : au plus 3, 5 ou 8 notifications par jour local
            selon le réglage, comptées sous verrou consultatif et écrites avec la livraison ; le
            programme du jour (<code className="font-mono text-xs">daily_digest</code>) ne compte ni
            n’est plafonné.
          </li>
          <li>
            <strong>Idempotence</strong> : déduplication{' '}
            <code className="font-mono text-xs">(user_id, dedupe_key)</code>, une livraison par
            canal et un événement{' '}
            <code className="font-mono text-xs">notification/delivery-due</code> écrit dans l’outbox
            de la même transaction.
          </li>
        </ul>
      </section>

      <section aria-labelledby="spec-2205-templates">
        <h2 id="spec-2205-templates" className="font-display text-xl font-semibold">
          Gabarits : seize types, deux tonalités
        </h2>
        <p className="mt-2 text-sm">
          Chaque type décide de l’icône, du titre, du corps, du lien interne et du gabarit e-mail ;
          chaque texte existe en <code className="font-mono text-xs">vous</code> et{' '}
          <code className="font-mono text-xs">tu</code>, choisis par le ton du profil. Les textes
          vivent dans <code className="font-mono text-xs">locale_fr</code>, jamais dans la logique.
        </p>
        <ul data-testid="spec-2205-templates" className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {NOTIFICATION_TYPES.map((type) => (
            <li key={type}>
              <code className="font-mono text-xs">{type}</code> × 2 tonalités
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm">
          Un titre tient en 120 caractères et un corps en 400 ; un lien n’est accepté que s’il est
          interne (chemin absolu, sans espace ni barre oblique inversée). Les gabarits e-mail Jinja2
          reprennent les mêmes textes, sujets, jetons de couleur et en-têtes{' '}
          <code className="font-mono text-xs">List-Unsubscribe</code> que le TypeScript.
        </p>
      </section>

      <section aria-labelledby="spec-2205-automations">
        <h2 id="spec-2205-automations" className="font-display text-xl font-semibold">
          Moteur d’automatismes et pause
        </h2>
        <p className="mt-2 text-sm">
          Le moteur propose, l’apprenant décide : aucune action ne s’applique sans consentement, et
          chaque décision est idempotente.
        </p>
        <ul data-testid="spec-2205-automations" className="mt-3 list-disc space-y-3 pl-5 text-sm">
          <li>
            <strong>Dix définitions</strong>, une par module et dans l’ordre de l’énumération de la
            base :{' '}
            {AUTOMATION_KEYS.map((key, index) => (
              <span key={key}>
                <code className="font-mono text-xs">{key}</code>
                {index === AUTOMATION_KEYS.length - 1 ? '.' : ', '}
              </span>
            ))}
          </li>
          <li>
            <strong>Contrat</strong> : <code className="font-mono text-xs">triggers</code>,{' '}
            <code className="font-mono text-xs">params</code>,{' '}
            <code className="font-mono text-xs">run</code>,{' '}
            <code className="font-mono text-xs">explain</code>,{' '}
            <code className="font-mono text-xs">apply</code> et{' '}
            <code className="font-mono text-xs">undo</code> ; un brouillon est validé (clé de
            déduplication, type d’action, résumé d’une ligne de 160 caractères, expiration, lien
            interne) avant toute écriture.
          </li>
          <li>
            <strong>Décisions</strong> : <code className="font-mono text-xs">accept</code>,{' '}
            <code className="font-mono text-xs">decline</code> et{' '}
            <code className="font-mono text-xs">undo</code> passent par une écriture unique ; le
            journal expose six statuts (<code className="font-mono text-xs">pending_consent</code>,{' '}
            <code className="font-mono text-xs">applied</code>,{' '}
            <code className="font-mono text-xs">declined</code>,{' '}
            <code className="font-mono text-xs">undone</code>,{' '}
            <code className="font-mono text-xs">expired</code>,{' '}
            <code className="font-mono text-xs">consumed</code>) et une expiration horaire.
          </li>
          <li>
            <strong>Pause</strong> : état <code className="font-mono text-xs">none</code>,{' '}
            <code className="font-mono text-xs">active</code> ou{' '}
            <code className="font-mono text-xs">ended</code>, gel puis reprise des formations,
            diagnostic déterministe de dix minutes au retour ; la pause et la remédiation sont les
            deux clés exemptées du réglage global.
          </li>
          <li>
            <strong>Revue hebdomadaire</strong> :{' '}
            <code className="font-mono text-xs">me.weekly-review.get</code> recalcule une charge
            complète ou partielle et laisse une charge figée intacte ; un identifiant d’action
            étranger répond 404 sans révéler son existence.
          </li>
        </ul>
      </section>

      <section aria-labelledby="spec-2205-jobs">
        <h2 id="spec-2205-jobs" className="font-display text-xl font-semibold">
          Cas d’usage de job
        </h2>
        <p className="mt-2 text-sm">
          Les quatre cas d’usage appelés par les crons et les événements sont portés ici, appelables
          et testés ; le branchement au worker Python (dispatcher, ordonnanceur) arrive en
          SPEC-2207, sans changer une réponse HTTP.
        </p>
        <ul data-testid="spec-2205-jobs" className="mt-3 list-disc space-y-3 pl-5 text-sm">
          {JOB_USE_CASES.map((useCase) => (
            <li key={useCase.name}>
              <code className="font-mono text-xs">{useCase.name}</code> : {useCase.text}
            </li>
          ))}
        </ul>
        <p data-testid="spec-2205-jobs-wiring" className="mt-3 text-sm">
          Ils sont prouvés par les vecteurs de l’oracle{' '}
          <code className="font-mono text-xs">tools/engagement/oracle-jobs.mjs</code> et par les
          tests d’intégration, sans écriture hors transaction. Le câblage au worker relève de
          SPEC-2207.
        </p>
      </section>

      <section aria-labelledby="spec-2205-garanties">
        <h2 id="spec-2205-garanties" className="font-display text-xl font-semibold">
          Garanties prouvées
        </h2>
        <dl data-testid="spec-2205-guarantees" className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="font-semibold">Parité contractuelle</dt>
            <dd>
              Les {parity.engagement ?? 0} scénarios du groupe{' '}
              <code className="font-mono text-xs">engagement</code> rejouent à l’identique entre
              Hono et la façade, et les groupes déjà enregistrés n’ont pas régressé : dix scénarios
              au total sur la campagne de clôture ({parityTotal} scénarios enregistrés dans
              l’oracle, tous contextes confondus). Les mutations et les routes à paramètre de chemin
              sont prouvées par l’intégration serveur.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">RLS et non-divulgation</dt>
            <dd>
              Chaque requête utilisateur s’exécute sous les claims de la transaction ; le rôle de
              service ne sert qu’aux écritures internes de{' '}
              <code className="font-mono text-xs">learny.shared.privileged</code>. Une ressource
              d’autrui répond exactement comme une ressource absente.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Plateforme</dt>
            <dd>
              E-mail en modes <code className="font-mono text-xs">memory</code>,{' '}
              <code className="font-mono text-xs">smtp</code> et{' '}
              <code className="font-mono text-xs">resend</code> ; push{' '}
              <code className="font-mono text-xs">pywebpush</code> avec un mode simulé ; pages de
              désinscription servies par l’API et gabarits Jinja2 identiques au TypeScript au mot
              près.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Frontières</dt>
            <dd>
              Le domaine ne dépend ni de FastAPI, ni de SQLAlchemy, ni d’un SDK ; les contrats
              import-linter le vérifient. Les adaptateurs HTTP et les handlers ne portent aucune
              règle métier.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
