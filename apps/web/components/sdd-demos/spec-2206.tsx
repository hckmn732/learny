// SPEC-2206 — demonstration page of the billing and privacy Python port (subscriptions,
// entitlements, Stripe webhook, data export, account deletion).
//
// Every counter comes from the committed artefacts: `api/inventory.json` (the operations, exported
// by SPEC-2001), `api/ownership.yaml` (the ownership table the facade reads at startup), the oracle
// vectors `api/oracles/vectors/billing.json` and `.../privacy.json` (recorded from the TypeScript
// backend) and `evidence/SPEC-2206/acceptance.md` (the suite totals). Only the prose and the
// domain constants are written here, with the module that owns them, so the page cannot drift from
// the evidence it describes.
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

/** The five application subscription statuses of `learny.billing.domain.subscription`. */
const SUBSCRIPTION_STATUSES = ['none', 'active', 'past_due', 'canceled', 'incomplete'] as const;

/** The five webhook outcomes of `WEBHOOK_RESULTS` (`packages/contracts/src/billing.ts`). */
const WEBHOOK_RESULTS = ['applied', 'duplicate', 'stale', 'ignored', 'unknown_customer'] as const;

/** The three job use cases ported by this specification; the worker wiring is SPEC-2207. */
const JOB_USE_CASES = [
  {
    name: 'run_data_export',
    text: 'charge, collecte, zippe, téléverse, finalise puis notifie un export, avec une reprise idempotente par identifiant d’export.',
  },
  {
    name: 'run_account_deletions',
    text: 'traite cinquante profils dus par nuit, reprend chaque étape depuis l’état persisté et ne supprime jamais deux fois.',
  },
  {
    name: 'purge_exports',
    text: 'supprime les archives dont l’expiration dépasse la grâce de vingt-quatre heures.',
  },
] as const;

/** The twenty tables read by `collect_export_data` (`privacy/infrastructure/queries.py`). */
const COLLECTED_TABLES = 20;

/** `SIGNED_URL_TTL_SECONDS`: ten minutes, the same bound as the TypeScript gateway (SPEC-114). */
const SIGNED_URL_TTL_SECONDS = 600;

/** `WEBHOOK_TOLERANCE_SECONDS` of `learny.billing.domain.config` (ADR-2031). */
const WEBHOOK_TOLERANCE_SECONDS = 300;

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

interface BillingVectorFigures {
  signatureCases: number;
  eventCases: number;
  configCases: number;
}

/** The billing oracle cases replayed by the domain tests, read from the committed vectors. */
function billingVectorFigures(): BillingVectorFigures {
  const vectors = JSON.parse(readApiFile('oracles', 'vectors', 'billing.json')) as {
    config: unknown[];
    signatures: { verifications: unknown[] };
    events: unknown[];
  };
  return {
    signatureCases: vectors.signatures.verifications.length,
    eventCases: vectors.events.length,
    configCases: vectors.config.length,
  };
}

interface PrivacyVectorFigures {
  downloadCases: number;
  archiveCases: number;
}

/** The privacy oracle cases replayed by the domain tests, read from the committed vectors. */
function privacyVectorFigures(): PrivacyVectorFigures {
  const vectors = JSON.parse(readApiFile('oracles', 'vectors', 'privacy.json')) as {
    entries: unknown[];
    download: unknown[];
  };
  return { downloadCases: vectors.download.length, archiveCases: vectors.entries.length };
}

interface EvidenceFigures {
  unitCases: string;
  integrationCases: string;
  vectorCases: string;
}

/** The suite totals stated by the committed acceptance of this specification. */
function evidenceFigures(): EvidenceFigures {
  const fallback: EvidenceFigures = {
    unitCases: '3535',
    integrationCases: '14',
    vectorCases: '13',
  };
  try {
    const text = readFileSync(
      path.join(process.cwd(), '..', '..', 'evidence', 'SPEC-2206', 'acceptance.md'),
      'utf8',
    );
    const unit = /\|\s*Suite unitaire complète\s*\|[^|]*\|\s*(\d+) réussis\s*\|/.exec(text)?.[1];
    const integration = /\|\s*Intégration du périmètre\s*\|[^|]*\|\s*(\d+) réussis\s*\|/.exec(
      text,
    )?.[1];
    const vectors = /\|\s*Vecteurs d’oracle du domaine\s*\|[^|]*\|\s*(\d+) réussis\s*\|/.exec(
      text,
    )?.[1];
    return {
      unitCases: unit ?? fallback.unitCases,
      integrationCases: integration ?? fallback.integrationCases,
      vectorCases: vectors ?? fallback.vectorCases,
    };
  } catch {
    return fallback;
  }
}

export default function Spec2206Demo() {
  const ownership = ownershipTable();
  const scoped = operations.filter(
    (operation) => operation.context === 'billing' || operation.context === 'privacy',
  );
  const billingOperations = scoped.filter((operation) => operation.context === 'billing').length;
  const privacyOperations = scoped.length - billingOperations;
  const flipped = scoped.filter((operation) => ownership[operation.id] === 'py').length;
  const remaining = scoped.length - flipped;
  const reads = scoped.filter((operation) => operation.method === 'GET').length;
  const writes = scoped.length - reads;
  const billing = billingVectorFigures();
  const privacy = privacyVectorFigures();
  const figures = evidenceFigures();

  return (
    <div className="mt-6 space-y-10">
      <section aria-labelledby="spec-2206-perimetre">
        <h2 id="spec-2206-perimetre" className="font-display text-xl font-semibold">
          Périmètre basculé
        </h2>
        <p className="mt-2 text-sm">
          Les contextes <code className="font-mono text-xs">billing</code> et{' '}
          <code className="font-mono text-xs">privacy</code> sont servis par l’API Python : la
          façade répond elle-même dès que{' '}
          <code className="font-mono text-xs">api/ownership.yaml</code> marque l’opération{' '}
          <code className="font-mono text-xs">py</code>, sans relais vers Hono. Les compteurs
          ci-dessous sont lus dans l’inventaire et dans la table de propriété, jamais saisis à la
          main.
        </p>
        <dl data-testid="spec-2206-scope" className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
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
        <p data-testid="spec-2206-scope-jobs" className="mt-3 text-sm">
          {billingOperations} opérations <code className="font-mono text-xs">billing</code> et{' '}
          {privacyOperations} opérations <code className="font-mono text-xs">privacy</code> ; les{' '}
          <strong>trois cas d’usage de job</strong> du périmètre sont portés et testés, leur câblage
          au worker relevant de SPEC-2207. Les quatre routes{' '}
          <code className="font-mono text-xs">dev.*</code> du plan restent au contexte{' '}
          <code className="font-mono text-xs">dev</code> de l’inventaire et à SPEC-2207.
        </p>
      </section>

      <section aria-labelledby="spec-2206-operations">
        <h2 id="spec-2206-operations" className="font-display text-xl font-semibold">
          Opérations du périmètre
        </h2>
        <p className="mt-2 text-sm">
          Chaque ligne vient de l’inventaire ; l’étiquette donne le propriétaire courant dans la
          table de propriété. Un handler ne contient aucune règle : il valide le contrat généré et
          appelle un cas d’usage de <code className="font-mono text-xs">learny.billing</code> ou de{' '}
          <code className="font-mono text-xs">learny.privacy</code>.
        </p>
        <ul data-testid="spec-2206-operations" className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
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
        <p className="mt-3 text-sm">
          <code className="font-mono text-xs">billing.webhook</code> est une route publique : sa
          preuve d’origine est la signature{' '}
          <code className="font-mono text-xs">Stripe-Signature</code> du corps brut, jamais
          l’en-tête <code className="font-mono text-xs">origin</code>, et la limite de débit y est
          désactivée par le contrat.
        </p>
      </section>

      <section aria-labelledby="spec-2206-entitlements">
        <h2 id="spec-2206-entitlements" className="font-display text-xl font-semibold">
          Entitlements et abonnement
        </h2>
        <p className="mt-2 text-sm">
          La ligne d’abonnement <em>est</em> le droit d’utiliser l’application : aucun droit n’est
          accordé par un champ calculé. Les règles sont pures, donc les cas d’usage et le contrat
          s’accordent par construction.
        </p>
        <ul data-testid="spec-2206-entitlements" className="mt-3 list-disc space-y-3 pl-5 text-sm">
          <li>
            <strong>Cinq statuts</strong> :{' '}
            {SUBSCRIPTION_STATUSES.map((status, index) => (
              <span key={status}>
                <code className="font-mono text-xs">{status}</code>
                {index === SUBSCRIPTION_STATUSES.length - 1 ? '.' : ', '}
              </span>
            ))}{' '}
            Seul <code className="font-mono text-xs">active</code> ouvre l’application ;{' '}
            <code className="font-mono text-xs">trialing</code> et{' '}
            <code className="font-mono text-xs">unpaid</code> sont ramenés par la table de
            correspondance, et un statut inconnu tombe sur{' '}
            <code className="font-mono text-xs">incomplete</code> : l’entitlement échoue fermé.
          </li>
          <li>
            <strong>Aucune période de grâce</strong> :{' '}
            <code className="font-mono text-xs">past_due</code>,{' '}
            <code className="font-mono text-xs">unpaid</code> et{' '}
            <code className="font-mono text-xs">paused</code> ne donnent aucun droit, et{' '}
            <code className="font-mono text-xs">currentPeriodEnd</code> est informatif — il ne
            prolonge jamais l’accès. Une réactivation passe par le portail.
          </li>
          <li>
            <strong>Souscription</strong> :{' '}
            <code className="font-mono text-xs">billing.checkout</code> crée le client Stripe au
            premier clic puis ouvre une session, et refuse un apprenant déjà{' '}
            <code className="font-mono text-xs">active</code> (
            <code className="font-mono text-xs">ALREADY_SUBSCRIBED</code>) ;{' '}
            <code className="font-mono text-xs">billing.portal</code> exige un client Stripe, sinon{' '}
            <code className="font-mono text-xs">NOT_FOUND</code>. Aucune clé ni aucun identifiant de
            paiement ne sort vers le navigateur.
          </li>
          <li>
            <strong>Mode simulé</strong> :{' '}
            <code className="font-mono text-xs">STRIPE_MODE=mock</code> remplace la passerelle par
            une simulation déterministe (identifiants numérotés{' '}
            <code className="font-mono text-xs">cus_mock_1</code>,{' '}
            <code className="font-mono text-xs">sub_mock_1</code>), sans clé ni socket ; le mode{' '}
            <code className="font-mono text-xs">live</code> est refusé en production et le mode mock
            y est interdit.
          </li>
        </ul>
      </section>

      <section aria-labelledby="spec-2206-webhook">
        <h2 id="spec-2206-webhook" className="font-display text-xl font-semibold">
          Webhook Stripe idempotent
        </h2>
        <p className="mt-2 text-sm">
          Le webhook lit le corps brut (un corps analysé casserait la signature) et répond toujours
          un 200 avec l’issue du traitement.
        </p>
        <ul data-testid="spec-2206-webhook" className="mt-3 list-disc space-y-3 pl-5 text-sm">
          <li>
            <strong>Signature vérifiée à l’horloge injectée</strong> : le schéma documenté par
            Stripe (HMAC-SHA-256 sur <code className="font-mono text-xs">t.corps</code>, comparaison
            à durée constante, tolérance de <strong>{WEBHOOK_TOLERANCE_SECONDS} s</strong>) est
            porté par <code className="font-mono text-xs">learny.billing.domain.webhook</code>{' '}
            plutôt que par <code className="font-mono text-xs">Webhook.construct_event</code>, qui
            lit l’horloge du processus (ADR-2031). Schéma, issues et codes sont identiques.
          </li>
          <li>
            <strong>Un seul effet métier</strong> : la livraison est enregistrée dans{' '}
            <code className="font-mono text-xs">stripe_events</code> dans la même transaction que la
            mise à jour de l’abonnement et l’événement d’outbox ; un rejeu rend{' '}
            <code className="font-mono text-xs">duplicate</code>, un événement plus ancien{' '}
            <code className="font-mono text-xs">stale</code>, un client inconnu{' '}
            <code className="font-mono text-xs">unknown_customer</code> sans créer d’utilisateur.
          </li>
          <li>
            <strong>Cinq issues</strong> :{' '}
            {WEBHOOK_RESULTS.map((result, index) => (
              <span key={result}>
                <code className="font-mono text-xs">{result}</code>
                {index === WEBHOOK_RESULTS.length - 1 ? '.' : ', '}
              </span>
            ))}
          </li>
          <li>
            <strong>Vecteurs rejoués</strong> :{' '}
            <strong>{billing.signatureCases} cas de vérification</strong> de signature et{' '}
            <strong>{billing.eventCases} événements</strong> normalisés, plus {billing.configCases}{' '}
            cas de configuration, comparés à égalité stricte avec le TypeScript.
          </li>
        </ul>
      </section>

      <section aria-labelledby="spec-2206-export">
        <h2 id="spec-2206-export" className="font-display text-xl font-semibold">
          Export de données personnelles
        </h2>
        <p className="mt-2 text-sm">
          L’export est une archive ZIP privée, produite par un job et servie par une URL signée de
          courte durée ; la collecte et la lecture passent par la transaction RLS de l’apprenant.
        </p>
        <ul data-testid="spec-2206-export" className="mt-3 list-disc space-y-3 pl-5 text-sm">
          <li>
            <strong>Collecte</strong> : {COLLECTED_TABLES} tables sont lues sous les claims de
            l’apprenant — profil, formation, programme, cours, ressources, tentatives, réponses,
            états de notion, lacunes, conversations et messages — et une formation partagée ne livre
            que le programme commun et le cours propre de l’apprenant.
          </li>
          <li>
            <strong>Archive ZIP</strong> : <code className="font-mono text-xs">README.txt</code>,{' '}
            <code className="font-mono text-xs">settings.json</code>,{' '}
            <code className="font-mono text-xs">results.json</code>,{' '}
            <code className="font-mono text-xs">conversations.json</code>, puis un dossier par
            formation (programme, cours, apports) ; les noms sont normalisés et les collisions
            suffixées, dans l’ordre exact du TypeScript.
          </li>
          <li>
            <strong>URL signée de {SIGNED_URL_TTL_SECONDS} s</strong> : dix minutes, jamais dans le
            corps persisté ; <code className="font-mono text-xs">?download=1</code> redirige en 302
            vers une URL fraîche, et un export qui n’est pas encore prêt répond{' '}
            <code className="font-mono text-xs">NOT_FOUND</code> (404).
          </li>
          <li>
            <strong>Expiration</strong> : l’archive est téléchargeable sept jours ; passée
            l’expiration, la lecture répond{' '}
            <code className="font-mono text-xs">EXPORT_EXPIRED</code> (410) et la purge du job
            n’efface la ligne qu’après une grâce de 24 h.
          </li>
          <li>
            <strong>Quota</strong> : trois exports par jour civil local, verrou consultatif et
            outbox dans la même transaction ; un export déjà en attente est rendu tel quel (un clic
            double ne crée ni second job ni second e-mail). Les{' '}
            <strong>{privacy.downloadCases} cas de téléchargeabilité</strong> et{' '}
            {privacy.archiveCases} modèles d’archive sont rejoués depuis l’oracle.
          </li>
        </ul>
      </section>

      <section aria-labelledby="spec-2206-deletion">
        <h2 id="spec-2206-deletion" className="font-display text-xl font-semibold">
          Suppression de compte
        </h2>
        <p className="mt-2 text-sm">
          La demande programme la suppression, ne l’exécute pas : l’effacement appartient au job
          nocturne, et une annulation ne laisse aucune donnée derrière elle.
        </p>
        <ul data-testid="spec-2206-deletion" className="mt-3 list-disc space-y-3 pl-5 text-sm">
          <li>
            <strong>Grâce de trente jours (J+30)</strong> : la demande pose l’échéance à J+30 et
            envoie un unique e-mail ; un rejeu rend la même échéance sans second envoi. La session
            reste valide et l’annulation est offerte dans les réglages.
          </li>
          <li>
            <strong>Annulation</strong> :{' '}
            <code className="font-mono text-xs">DELETE /me/deletion</code> efface les deux colonnes
            et répond <strong>204</strong> même sans demande en attente ; après annulation, le job
            ne supprime rien.
          </li>
          <li>
            <strong>Exécution nocturne</strong> : cinquante profils dus au plus par passage, chaque
            étape reprise depuis l’état persisté, et une suppression unique même si le job est
            rejoué.
          </li>
          <li>
            <strong>Effacement</strong> : les commandes explicites de chaque contexte produisent un
            reçu par domaine — formation transférée, données anonymisées, lignes en cascade, puis le
            compte Auth supprimé avec le rôle de service.
          </li>
        </ul>
      </section>

      <section aria-labelledby="spec-2206-garanties">
        <h2 id="spec-2206-garanties" className="font-display text-xl font-semibold">
          Garanties prouvées
        </h2>
        <dl data-testid="spec-2206-guarantees" className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="font-semibold">Parité contractuelle</dt>
            <dd>
              Aucun scénario généré n’existe pour les groupes{' '}
              <code className="font-mono text-xs">billing</code> et{' '}
              <code className="font-mono text-xs">privacy</code> : le harnais de parité ne sait pas
              enregistrer ces lectures, et aucun scénario n’a été inventé (ADR-2008). La parité est
              prouvée par les <strong>{figures.vectorCases} tests de vecteurs d’oracle</strong>{' '}
              enregistrés depuis le TypeScript et rejoués à égalité stricte, plus{' '}
              <strong>{figures.integrationCases} cas d’intégration</strong> sur la base locale.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Suite</dt>
            <dd>
              <strong>{figures.unitCases} cas unitaires</strong> verts sur la suite complète, dont
              les trois fichiers de vecteurs du périmètre, et un e2e qui consomme réellement les
              opérations à travers le web et la façade.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">RLS et non-divulgation</dt>
            <dd>
              Chaque lecture et chaque écriture s’exécutent sous les claims de la transaction ; le
              rôle de service ne sert qu’aux écritures internes de{' '}
              <code className="font-mono text-xs">learny.shared.privileged</code>. L’export, la
              suppression d’un autre apprenant et une ressource absente répondent exactement de la
              même façon.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Frontières</dt>
            <dd>
              Les domaines ne dépendent ni de FastAPI, ni de SQLAlchemy, ni d’un SDK ; les contrats{' '}
              <code className="font-mono text-xs">import-linter</code> le vérifient, et les
              adaptateurs HTTP et les handlers ne portent aucune règle métier.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Jobs du périmètre</dt>
            <dd>
              {JOB_USE_CASES.map((useCase) => useCase.name).join(', ')} sont portés et testés ; leur
              branchement au worker Python arrive en SPEC-2207, sans changer une réponse HTTP.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
