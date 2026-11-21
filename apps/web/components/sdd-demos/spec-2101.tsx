// SPEC-2101 — demonstration page of the Python database layer, identity, RLS and storage.
//
// Every figure comes from the committed artefacts (`api/oracles/vectors/rls-matrix.json`, exported
// from packages/db/src/rls/matrix.ts and replayed by the Python integration suite), so the page
// cannot drift from the evidence.
import matrix from '../../../../api/oracles/vectors/rls-matrix.json';

const TABLES = matrix.tables.length;
const POLICIES = matrix.policyNames.length;
const PERSONAL = matrix.categoryCounts.personal;
const SHARED = matrix.categoryCounts['shared-programme'];
const SERVICE = matrix.categoryCounts.service;

export default function Spec2101Demo() {
  return (
    <div className="mt-6 space-y-8">
      <section aria-labelledby="spec-2101-rls">
        <h2 id="spec-2101-rls" className="font-display text-xl font-semibold">
          Matrice RLS rejouée sous Python
        </h2>
        <p className="mt-2 text-sm">
          L’inventaire exporté depuis{' '}
          <code className="font-mono text-xs">packages/db/src/rls/matrix.ts</code> est rejoué par la
          suite d’intégration Python avec de vraies transactions{' '}
          <code className="font-mono text-xs">authenticated</code> : mêmes politiques, mêmes
          privilèges, même catalogue <code className="font-mono text-xs">pg_policies</code>.
        </p>
        <dl data-testid="spec-2101-rls" className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-sm">Tables inventoriées</dt>
            <dd className="text-2xl font-semibold">{TABLES}</dd>
          </div>
          <div>
            <dt className="text-sm">Tables personnelles</dt>
            <dd className="text-2xl font-semibold">{PERSONAL}</dd>
          </div>
          <div>
            <dt className="text-sm">Programme partagé</dt>
            <dd className="text-2xl font-semibold">{SHARED}</dd>
          </div>
          <div>
            <dt className="text-sm">Politiques vérifiées</dt>
            <dd className="text-2xl font-semibold">{POLICIES}</dd>
          </div>
        </dl>
        <p data-testid="spec-2101-service" className="mt-3 text-sm">
          Les {SERVICE} tables de service (clés d’idempotence, seaux de débit, boîte d’envoi)
          restent invisibles au client : aucune politique, aucune écriture possible.
        </p>
      </section>

      <section aria-labelledby="spec-2101-identite">
        <h2 id="spec-2101-identite" className="font-display text-xl font-semibold">
          Identité
        </h2>
        <p data-testid="spec-2101-identity" className="mt-2 text-sm">
          Le porteur d’un jeton <code className="font-mono text-xs">Bearer</code> passe avant le
          cookie de session relayé ; un jeton porteur invalide n’est jamais remplacé par le cookie.
          L’expiration est comparée à l’horloge injectée, et un JWKS inaccessible déclenche le repli{' '}
          <code className="font-mono text-xs">GET /auth/v1/user</code> d’ADR-1009. Une mutation qui
          exige les conditions en vigueur répond 422{' '}
          <code className="font-mono text-xs">LEGAL_ACCEPTANCE_REQUIRED</code>.
        </p>
      </section>

      <section aria-labelledby="spec-2101-gardes">
        <h2 id="spec-2101-gardes" className="font-display text-xl font-semibold">
          Gardes HTTP portées
        </h2>
        <ul data-testid="spec-2101-guards" className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>
            Origine : comparaison exacte après normalisation, exemptions webhooks et désabonnement,
            secret de relais courant et précédent comparé à temps constant.
          </li>
          <li>
            Débit : un seul upsert atomique par requête, profils 120 / 20 / 10 jetons, en-têtes{' '}
            <code className="font-mono text-xs">ratelimit-*</code>, 429 avec{' '}
            <code className="font-mono text-xs">Retry-After</code>, 503 si la base tombe.
          </li>
          <li>
            Idempotence : empreinte canonique, réservation{' '}
            <code className="font-mono text-xs">on conflict do nothing</code>, rejeu pendant 24 h,
            409 pendant l’exécution, libération sur 5xx.
          </li>
        </ul>
      </section>

      <section aria-labelledby="spec-2101-storage">
        <h2 id="spec-2101-storage" className="font-display text-xl font-semibold">
          Storage privé
        </h2>
        <p data-testid="spec-2101-storage" className="mt-2 text-sm">
          Un objet vit sous{' '}
          <code className="font-mono text-xs">&lt;userId&gt;/&lt;uuid&gt;/&lt;nom&gt;</code>; l’URL
          de lecture est signée 600 s après preuve de la ligne en base, et le jeton d’envoi est
          fabriqué localement en HS256 avec la durée exacte de dix minutes.
        </p>
      </section>
    </div>
  );
}
