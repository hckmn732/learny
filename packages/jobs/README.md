# @learny/jobs

Jobs durables Inngest (ADR-0017) : un seul client, un seul catalogue d'événements et un seul registre de fonctions, servis à l'identique par `apps/web` (`/api/inngest`, adaptateur Next.js) et `apps/worker` (`/api/inngest`, adaptateur Hono).

## API publique (`@learny/jobs`)

- `inngest` : client unique (`id: 'learny'`) ; `createLearnyClient(env)` le construit (en `APP_ENV=production`, le mode Dev Server est toujours désactivé : la signature reste vérifiée).
- `events`, `EVENT_NAMES`, `sddDemoJobRequested`, `demoJobInputSchema` : catalogue typé (schémas Zod validés par le SDK avant le gestionnaire).
- `functions` : registre partagé ; `createFunctions(client, deps)` le construit avec des ports injectés (stockage).
- `sdd/demo-job` (`DEMO_JOB_ID = 'sdd-demo-job'`) : `{ runId, value }` → étapes `validate-input` puis `persist-result` → `{ runId, doubledValue }` ; idempotent sur `runId`, conflit si la valeur diffère ; `JOB_RETRIES = 3`.
- Erreurs : `PermanentJobError` (`NonRetriableError`, codes `VALIDATION_FAILED`, `IDEMPOTENCY_CONFLICT`) jamais reprise ; toute autre erreur (dont `TransientJobError`) est reprise par Inngest.
- `createMemoryDemoStore()` : adaptateur mémoire de démonstration et de test (pas un stockage produit).

## Adaptateurs du harnais (`@learny/jobs/testing`)

- `executeDirect(handler, options)` : exécution directe d'un gestionnaire avec mémorisation des étapes et reprises simulées (page SDD, tests unitaires).
- `driveInngestRun(options)` : joue le rôle de l'exécuteur Inngest sur le protocole HTTP réel du gestionnaire `serve()` (tests d'intégration).

Aucun des deux ne contacte Inngest Dev Server ni Inngest Cloud. L'essai HTTP avec Inngest Dev Server (`INNGEST_DEV=1`, `npx inngest-cli dev`) relève de l'environnement local (SPEC-008).

```ts
import { createFunctions, inngest } from '@learny/jobs';
import { serve } from 'inngest/next';

export const { GET, POST, PUT } = serve({ client: inngest, functions });
```
