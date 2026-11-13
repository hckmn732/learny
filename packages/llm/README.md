# `@learny/llm`

Unique point d'accès aux modèles d'IA (SPEC-504) : résolution `(utilisateur, tâche) → modèle`,
fabrique de fournisseurs AI SDK, sessions d'appel, options Anthropic, modèle simulé déterministe,
conversion des erreurs et journal `ai_calls`. Aucun autre paquet n'importe un SDK de fournisseur
(BR-IA-09, vérifié par ESLint et `src/architecture.test.ts`).

## API publique

```ts
import { llm, resolveModel, uploadDocument } from '@learny/llm';

const resolved = await resolveModel(db, { userId, task: 'tutor' });
if (!resolved.ok) return resolved;

const session = await llm.session(
  { userId, db, requestId },
  { task: 'tutor', promptId: 'tutor.demo', formationId, mock: { scenario: 'demo' } },
);
if (!session.ok) return session;

const step = await session.value.step({
  system: [{ text: 'Instructions stables', cache: true }],
  messages: [{ role: 'user', content: 'Bonjour' }],
  tools: { read_resources: { description: 'Lit', inputSchema } },
});
```

- `resolveModel` applique EF-1 dans l'ordre : modèle personnel qualifié, IA fournie (surcharge
  Claude autorisée), sinon `AI_UNAVAILABLE` avec `reason` (`no_subscription_no_key` ou
  `credential_not_qualified`) et le lien `/parametres#modeles`.
- `step` déclare les outils mais ne les exécute jamais (la boucle est dans SPEC-508) ; `object`
  produit une sortie structurée validée par Zod ; `stream` renvoie le `StreamTextResult` de l'AI SDK.
- Chaque appel écrit exactement une ligne `ai_calls`. `costCalculator` et `budgetGuard` sont les
  crochets de SPEC-507 ; leur défaut autorise l'appel et journalise un coût nul.
- `uploadDocument` renvoie `file_mock_<sha256 tronqué>` en mode `mock` ; en `live`, seule l'API
  Files d'Anthropic est utilisée (`FILES_UNSUPPORTED` sinon).

## Mode simulé

`LLM_MODE=mock` (obligatoire en test, ADR-0048) sélectionne une fixture JSON sous
`fixtures/<task>/<scenario>.json`, consommée étape par étape. La sélection suit ADR-0153 :

1. scénario explicite (`mock.scenario`) ;
2. marqueur `[[mock:<scenario>]]` dans un message, retiré avant l'appel ;
3. première fixture du dossier (ordre alphabétique) dont `promptId` correspond et dont toutes les
   chaînes `match.contains` figurent dans la sérialisation canonique des messages ;
4. `fixtures/<task>/<promptId>.default.json` (ou `<basename>.default.json`) ;
5. sinon `MOCK_FIXTURE_NOT_FOUND` ; au-delà de la dernière étape, `MOCK_STEPS_EXHAUSTED`.

Le schéma Zod `FixtureFileSchema` (`src/mock/fixture-schema.ts`) est la source de
`fixtures/fixture.schema.json` (généré, ne pas éditer à la main). `fixtures/prompts/index.json`
déclare la version de chaque consigne tant que `packages/tutor/prompts` n'existe pas ; le test
`fixtures.test.ts` vérifie que toutes les fixtures du dépôt sont enregistrées et à jour.

## Erreurs

`AI_KEY_INVALID`, `AI_RATE_LIMITED`, `AI_PROVIDER_ERROR`, `AI_TIMEOUT`, `AI_REFUSED`,
`AI_CONTEXT_TOO_LONG`, `INVALID_OUTPUT`, `AI_UNAVAILABLE`, `FILES_UNSUPPORTED`,
`CITATIONS_WITH_STRUCTURED_OUTPUT`, `MOCK_FIXTURE_NOT_FOUND`, `MOCK_STEPS_EXHAUSTED`.
Les messages exposés ne contiennent jamais la clé, l'URL complète ni le contenu des apports.
