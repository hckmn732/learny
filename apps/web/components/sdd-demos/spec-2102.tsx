// SPEC-2102 — demonstration page of the durable worker that replaces Inngest (ADR-2006, ADR-2014).
//
// The page describes the guarantees proved by the tests. The event count comes from the committed
// catalogue; the consumer name is the one `api/ownership.yaml` declares `py` and the worker's
// registry test asserts (`test_a_python_owned_consumer_is_active`).
import events from '../../../../api/events.schema.json';

const EVENT_COUNT = Object.keys(events).length;
const PY_CONSUMERS = ['devtools.demo_job'];

export default function Spec2102Demo() {
  return (
    <div className="mt-6 space-y-8">
      <section aria-labelledby="spec-2102-pipeline" data-testid="spec-2102-pipeline">
        <h2 id="spec-2102-pipeline" className="font-display text-xl font-semibold">
          De l’événement à l’effet
        </h2>
        <p className="mt-2 text-sm">
          Un cas d’usage écrit son événement dans{' '}
          <code className="font-mono text-xs">public.event_outbox</code> dans sa propre transaction.
          Le répartiteur Python estampille <code className="font-mono text-xs">dispatched_at</code>{' '}
          et crée une ligne <code className="font-mono text-xs">job_deliveries</code> par
          consommateur Python abonné ; l’exécuteur réclame la livraison sous bail, appelle le cas
          d’usage, puis la marque terminée. Aucun appel HTTP interne n’est fait (ET-3).
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm">Événements catalogués</dt>
            <dd className="text-2xl font-semibold">{EVENT_COUNT}</dd>
          </div>
          <div>
            <dt className="text-sm">Consommateurs Python</dt>
            <dd className="text-2xl font-semibold">{PY_CONSUMERS.length}</dd>
          </div>
          <div>
            <dt className="text-sm">Livraisons</dt>
            <dd className="text-lg font-semibold">une par couple</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="spec-2102-garanties">
        <h2 id="spec-2102-garanties" className="font-display text-xl font-semibold">
          Garanties prouvées
        </h2>
        <ul data-testid="spec-2102-guarantees" className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>
            Réclamation bornée par <code className="font-mono text-xs">for update skip locked</code>{' '}
            : deux workers concurrents ne prennent jamais la même livraison.
          </li>
          <li>
            Bail <code className="font-mono text-xs">locked_until</code> : un worker tué laisse une
            livraison reprise à l’expiration, avec un seul effet par événement.
          </li>
          <li>
            Backoff exponentiel borné (10 s, 20 s, 40 s… plafonné à 1 h) et échec définitif sur
            erreur permanente ou dernière tentative.
          </li>
          <li>
            Charge utile invalide : livraison marquée{' '}
            <code className="font-mono text-xs">failed</code> sans exécution, jamais réessayée.
          </li>
        </ul>
      </section>

      <section aria-labelledby="spec-2102-planificateur">
        <h2 id="spec-2102-planificateur" className="font-display text-xl font-semibold">
          Planificateur singleton
        </h2>
        <p data-testid="spec-2102-scheduler" className="mt-2 text-sm">
          Une seule instance détient <code className="font-mono text-xs">pg_try_advisory_lock</code>{' '}
          ; les autres restent en veille et réessaient toutes les 15 s. Deux horaires seulement,
          sans bibliothèque de cron : le tick horaire à la minute 5 et le tick nocturne à 01:30 UTC.
          Les crons restent TypeScript jusqu’à SPEC-2207 : le planificateur est inactif tant que{' '}
          <code className="font-mono text-xs">ownership.yaml</code> ne les déclare pas{' '}
          <code className="font-mono text-xs">py</code>.
        </p>
      </section>

      <section aria-labelledby="spec-2102-propriete">
        <h2 id="spec-2102-propriete" className="font-display text-xl font-semibold">
          Propriété des consommateurs
        </h2>
        <p className="mt-2 text-sm">
          Le worker ne lance que les consommateurs que{' '}
          <code className="font-mono text-xs">api/ownership.yaml</code> déclare{' '}
          <code className="font-mono text-xs">py</code>. Un consommateur encore Hono n’est jamais
          exécuté côté Python.
        </p>
        <p data-testid="spec-2102-ownership" className="mt-2 font-mono text-sm">
          {PY_CONSUMERS.join(', ')}
        </p>
      </section>
    </div>
  );
}
