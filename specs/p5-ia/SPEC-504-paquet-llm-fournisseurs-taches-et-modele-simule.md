---
id: SPEC-504
title: Paquet llm : fournisseurs, tâches et modèle simulé
phase: P5
priority: V1
depends_on: [SPEC-110, SPEC-201, SPEC-009]
business_rules: [BR-IA-01, BR-IA-06, BR-IA-09]
screens: []
adrs: [ADR-0018, ADR-0019, ADR-0048, ADR-0153]
visual: demo
---

# SPEC-504 — Paquet llm : fournisseurs, tâches et modèle simulé

## 1. Objectif

Livrer `@learny/llm`, unique point d'accès aux modèles : résolution (utilisateur, tâche) → modèle, fabrique de fournisseurs AI SDK, sessions d'appel (`step`, `object`, `stream`) avec options Anthropic (réflexion adaptative et effort, cache, outils stricts, citations, API Files, recherche web, repli sur refus), modèle simulé alimenté par fixtures (ADR-0153), conversion des erreurs et journalisation de base dans `ai_calls`.

## 2. Contexte

- Lire : `docs/architecture/ai.md` §1, §2, §4, §6 ; `docs/architecture/overview.md` §1 (principe 5 : aucun autre paquet n'importe un SDK de fournisseur), §3 (frontières : `llm` importe `core`, `config`, `contracts`, `db`) ; `docs/architecture/data-model.md` §9 ; ADR-0011, ADR-0013, ADR-0018, ADR-0019, ADR-0048, ADR-0153.
- Consommateurs : SPEC-505 (clés), SPEC-506 (qualification), SPEC-507 (plafond et coût, qui branche son garde-fou sur le crochet `budgetGuard`), SPEC-508 (boucle), SPEC-509/510 (Files, vision), SPEC-512 (recherche web), SPEC-513 (lots).

## 3. Dépendances

- **SPEC-110** : tables `ai_credentials`, `ai_task_models`, `ai_calls`, `subscriptions`, énumérations `ai_task`, `ai_provider`.
- **SPEC-201** : `AppError`, catalogue des codes, `handler()`.
- **SPEC-009** : `packages/config` : `env` (`LLM_MODE` `live|mock`, `ANTHROPIC_API_KEY`, `LLM_LIVE_TESTS`), `models.ts`, `pricing.ts`, `product.ts`.
- SPEC-210 (fait, phase P2) : `hasManagedAi(userId)`.
- Bibliothèques : `ai` (AI SDK ≥ 5) et `ai/test`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/mistral`, `@ai-sdk/deepseek`, `@ai-sdk/openai-compatible`. Indisponibilité d'Anthropic : en `mock` aucun réseau ; en `live` erreurs converties (ET-7). Les tests « live » ne tournent que si `LLM_LIVE_TESTS=1` et ne font pas partie des validations.

## 4. Règles métier couvertes

- **BR-IA-01** : `TASK_CONFIG` associe chaque tâche à son modèle par défaut lu dans `packages/config/src/models.ts` : `programme`, `course`, `gaps` → `claude-opus-5-5` ; `tutor` → `claude-sonnet-5-5` ; `light` → `claude-haiku-5-5`. Aucun identifiant de modèle en dur ailleurs (règle ESLint `no-restricted-syntax` sur le motif `claude-`).
- **BR-IA-06** : `resolveModel` renvoie `AI_UNAVAILABLE` (avec `reason` et lien `/parametres#modeles`) quand l'utilisateur n'a ni abonnement actif ni clé qualifiée affectée à la tâche ; les fonctions sans IA ne passent jamais par `@learny/llm`.
- **BR-IA-09** : `@learny/llm` n'est importable que par `tutor`, `ingestion` et `services` (frontières ESLint) ; `learning-engine` et `bricks` ne peuvent pas l'importer (test d'architecture).

## 5. Exigences fonctionnelles

- **EF-1** — Résolution, dans cet ordre : (1) ligne `ai_task_models(user, task)` avec `credential_id` non nul, identifiant `qualified` et `model_id ∈ model_ids` → modèle personnel ; (2) sinon, si `hasManagedAi(user)` → IA fournie : `model_id` de la ligne si elle désigne un modèle Claude de `MANAGED_MODELS`, sinon le défaut de la tâche ; (3) sinon, si une ligne désigne un identifiant non qualifié ou supprimé → `AI_UNAVAILABLE` `reason: 'credential_not_qualified'` ; (4) sinon → `AI_UNAVAILABLE` `reason: 'no_subscription_no_key'`. Jamais de bascule automatique d'un modèle personnel vers l'IA fournie (ADR-0013).
- **EF-2** — Message utilisateur d'`AI_UNAVAILABLE` (titre problem+json, français) : « Cette fonction demande un modèle d'IA. Abonnez-vous à l'IA fournie ou ajoutez votre propre clé dans Paramètres › Modèles d'IA. » ; statut HTTP 422.
- **EF-3** — Sessions : `llm.session(ctx, { task, formationId, promptId, mock? })` résout le modèle une fois et expose `step()` (un appel génératif, avec outils déclarés sans exécution), `object(schema)` (sortie structurée), `stream()` (texte en flux, ADR-0066). Chaque appel produit exactement une ligne `ai_calls`.
- **EF-4** — Modèle simulé : en `LLM_MODE=mock`, toute session utilise `MockLanguageModel` (AI SDK `ai/test`, version de l'interface correspondant à la majeure installée) alimenté par la fixture choisie (ADR-0153) ; la résolution (EF-1) reste exécutée pour que `AI_UNAVAILABLE` soit testable ; `provider`/`model` journalisés sont ceux résolus, avec `latency_ms` de la fixture (défaut 0).
- **EF-5** — Journal de base : `ai_calls` reçoit `user_id`, `formation_id`, `task`, `provider`, `model` (identifiant renvoyé par la réponse si différent : repli), `managed`, tokens (entrée, sortie, lecture et écriture cache), `latency_ms`, `status` (`ok|error|refused|invalid_output`), `error_code`, `batch=false`, `cost_usd` calculé par le `costCalculator` injecté (0 tant que SPEC-507 n'a pas branché le sien).

## 6. Exigences techniques

**ET-1 — Tâches** (`src/tasks.ts`) :
```ts
export const TASK_CONFIG = {
  programme: { effort: 'high',   maxOutputTokens: 32000, timeoutMs: 180_000, capabilities: ['tools','structured','web_search'] },
  course:    { effort: 'medium', maxOutputTokens: 64000, timeoutMs: 300_000, capabilities: ['structured','passage_refs'] },
  gaps:      { effort: 'medium', maxOutputTokens: 16000, timeoutMs: 120_000, capabilities: ['structured'] },
  tutor:     { effort: 'low',    maxOutputTokens: 8000,  timeoutMs: 60_000,  capabilities: ['tools','structured'] },
  light:     { effort: 'low',    maxOutputTokens: 4000,  timeoutMs: 30_000,  capabilities: ['structured','vision'] },
} as const satisfies Record<AiTask, TaskConfig>;
```
Les appels dont le `maxOutputTokens` dépasse 16 000 passent en flux côté fournisseur (`streamText`/`streamObject` puis résultat final) pour éviter les délais HTTP.

**ET-2 — Résolution** (`src/resolve.ts`) :
```ts
export type ResolvedModel =
  | { kind: 'managed'; provider: 'anthropic'; modelId: ManagedModelId; task: AiTask }
  | { kind: 'byok'; provider: AiProvider; modelId: string; credentialId: string; baseUrl: string | null; outsideEu: boolean; task: AiTask };
export function resolveModel(db: Db, input: { userId: string; task: AiTask }): Promise<Result<ResolvedModel, AppError /* AI_UNAVAILABLE */>>;
```

**ET-3 — Fabrique** (`src/providers/factory.ts`) : `createLanguageModel(resolved, secrets: { apiKey: string | null }) : LanguageModel`. IA fournie : `createAnthropic({ apiKey: env.ANTHROPIC_API_KEY, fetch: anthropicFetch })`. Modèle personnel : la clé est déchiffrée par SPEC-505 (`decryptCredentialKey`) juste avant l'appel, gardée en mémoire le temps de la session, jamais journalisée ; `openai_compatible` et `local` utilisent `createOpenAICompatible({ baseURL })` (`local` sans clé). Catalogue des fournisseurs (`src/providers/catalog.ts`) : `anthropic`, `openai`, `mistral`, `deepseek`, `openai_compatible`, `local` avec `supports { tools, structured, webSearch, citations, files, cache, batch, thinking }` (vrai pour tout sur Anthropic ; `tools`, `structured` ailleurs ; `cache` pour openai et deepseek, implicite) et `dataRegion` (renseigné par SPEC-505).

**ET-4 — Options Anthropic** (`src/anthropic-options.ts`), appliquées quand `provider = 'anthropic'` (IA fournie ou clé personnelle) ; contrat au niveau du corps HTTP envoyé à `POST /v1/messages`, vérifié par MSW :
- `thinking: { type: 'adaptive' }` toujours ; jamais `budget_tokens` (rejeté par les modèles 5.5) ; `output_config: { effort }` selon ET-1 ;
- aucun `temperature`/`top_p`/`top_k` ;
- `tool_choice` toujours `{ type: 'auto' }` (le choix forcé est refusé par Opus/Sonnet 5.5) ; outils déclarés avec `strict: true` (schémas JSON issus de Zod, `additionalProperties: false`) ;
- cache : les parties système marquées `cache: true` (instructions, outils, programme) sont placées en tête et la dernière reçoit `cache_control: { type: 'ephemeral' }` ; au plus 4 points de cache par requête ;
- repli sur refus : pour `claude-opus-5-5` et `claude-sonnet-5-5` sur l'IA fournie, `fallbacks: "default"` avec l'en-tête `anthropic-beta: server-side-fallback-2026-07-01` ; pas de repli pour `claude-haiku-5-5` ni pour les clés personnelles ;
- documents : `{ type: 'document', source: { type: 'file', file_id }, citations: { enabled: true } }` quand une session reçoit `documents` et `citations: true` (jamais combiné avec une sortie structurée : `CITATIONS_WITH_STRUCTURED_OUTPUT` levé avant l'appel) ;
- recherche web serveur : outil `{ type: 'web_search_20260209', name: 'web_search', max_uses }` (utilisé par SPEC-512).
Les clés non prises en charge nativement par la version installée de `@ai-sdk/anthropic` sont injectées par `anthropicFetch`, qui réécrit le corps JSON et les en-têtes ; un test vérifie le corps final.

**ET-5 — Sessions** (`src/session.ts`) :
```ts
export interface LlmContext { userId: string; db: Db; requestId?: string }
export interface SystemPart { text: string; cache: boolean }
export interface StepInput { system: SystemPart[]; messages: ModelMessage[]; tools?: Record<string, { description: string; inputSchema: z.ZodTypeAny }>; documents?: DocumentRef[]; citations?: boolean; abortSignal?: AbortSignal }
export interface StepOutput { text: string; toolCalls: Array<{ toolCallId: string; toolName: string; input: unknown }>; finishReason: 'stop'|'tool-calls'|'length'|'refusal'|'error'; usage: Usage; responseMessages: ModelMessage[]; modelId: string; citations?: CitationPart[] }
export interface LlmSession {
  resolved: ResolvedModel;
  step(input: StepInput): Promise<Result<StepOutput, AppError>>;
  object<S extends z.ZodTypeAny>(input: Omit<StepInput,'tools'> & { schema: S }): Promise<Result<z.infer<S>, AppError>>;
  stream(input: StepInput): Promise<Result<StreamTextResult, AppError>>;
}
export function createSession(ctx: LlmContext, opts: { task: AiTask; formationId?: string | null; promptId: string; mock?: { scenario?: string }; budgetGuard?: BudgetGuard; costCalculator?: CostCalculator }): Promise<Result<LlmSession, AppError>>;
export const llm = { session: createSession, resolveModel };
```
`BudgetGuard` (`(ctx, { resolved, estimate }) => Promise<Result<{ resolved: ResolvedModel }, AppError>>`) est appelé avant chaque appel ; défaut : autorise. `step` n'exécute jamais d'outil (la boucle est dans SPEC-508).

**ET-6 — Modèle simulé** (`src/mock/`) : `fixture-schema.ts` (ADR-0153), `select.ts` (`selectFixture({ task, promptId, messages, explicitScenario }) → Result<Fixture, MockError>`), `mock-model.ts` (`createMockModel(fixture)` : `doGenerate` renvoie l'étape suivante — texte, appels d'outils (`type: 'tool-call'`, `input` sérialisé JSON), objet (texte JSON), erreur levée sous forme d'`APICallError` de statut adéquat ou `finishReason: 'refusal'` pour `refusal` ; `doStream` découpe `chunks`). Sérialisation canonique : `JSON.stringify` des messages avec clés triées. Le marqueur `[[mock:x]]` est retiré du texte transmis.

**ET-7 — Erreurs** (`src/errors.ts`, codes ajoutés à `packages/core/src/errors.ts`) : 401/403 → `AI_KEY_INVALID` ; 429 → `AI_RATE_LIMITED` (après 2 réessais AI SDK) ; 5xx, 529, réseau → `AI_PROVIDER_ERROR` ; délai (`timeoutMs`) → `AI_TIMEOUT` ; `stop_reason: refusal` → `AI_REFUSED` ; contexte trop long → `AI_CONTEXT_TOO_LONG` ; sortie structurée non conforme → `INVALID_OUTPUT` ; `AI_UNAVAILABLE`. Chaque erreur journalise une ligne `ai_calls` (`status` `error`, `refused` ou `invalid_output`). Les messages d'erreur exposés ne contiennent jamais la clé, l'URL complète ni le contenu des apports.

**ET-8 — Files API** (`src/files.ts`) : `uploadDocument(ctx, { resolved, bytes, mime, filename }) → Result<{ fileId: string }, AppError>` (Anthropic uniquement, sinon `FILES_UNSUPPORTED`) ; en `mock` renvoie `file_mock_<sha256 tronqué à 16>`.

**ET-9 — Sécurité** : aucun SDK de fournisseur importé hors `packages/llm` (ESLint `no-restricted-imports` + test) ; `ANTHROPIC_API_KEY` lue uniquement côté serveur ; logger : champs `task`, `provider`, `model`, `status`, `latencyMs`, jamais messages ni clé.

## 7. Comportements attendus et cas limites

- **CL-1** Utilisateur sans abonnement ni clé → `AI_UNAVAILABLE` (`no_subscription_no_key`), aucun appel, une ligne `ai_calls` n'est pas créée (pas d'appel).
- **CL-2** Clé révoquée chez le fournisseur (401) → `AI_KEY_INVALID`, `ai_calls.status='error'`, `error_code='AI_KEY_INVALID'` ; SPEC-505/506 passent alors l'identifiant `failed` (hors de cette spécification : l'erreur porte `credentialId`).
- **CL-3** Refus du modèle (fixture `error.kind = refusal`) → `AI_REFUSED`, `status='refused'`.
- **CL-4** Délai dépassé (fixture `timeout`, ou `abortSignal`) → `AI_TIMEOUT`.
- **CL-5** Sortie structurée invalide (objet ne respectant pas le schéma) → `INVALID_OUTPUT` avec les erreurs Zod (pour renvoi au modèle par l'appelant).
- **CL-6** Fixture introuvable → `MOCK_FIXTURE_NOT_FOUND` listant les candidats essayés ; étapes épuisées → `MOCK_STEPS_EXHAUSTED`.
- **CL-7** Ligne `ai_task_models` pointant vers une clé supprimée (`credential_id` mis à null par cascade) → traitée comme IA fournie si abonné, sinon `AI_UNAVAILABLE`.
- **CL-8** Abonnement `past_due` → `hasManagedAi` faux → `AI_UNAVAILABLE` sauf clé qualifiée.
- **CL-9** Repli serveur sur refus : la réponse indique un autre modèle → `ai_calls.model` = modèle effectif.
- **CL-10** Modèle personnel (non Anthropic) appelé avec `documents` → texte extrait fourni par l'appelant ; `citations: true` ignoré (`supports.citations` faux) et signalé dans `StepOutput.citations = undefined`.
- **CL-11** `LLM_MODE=live` sans `ANTHROPIC_API_KEY` en production → échec de démarrage (SPEC-009) ; en local, `LLM_MODE` vaut `mock` par défaut.

## 8. Instructions d'implémentation

1. Créer `packages/llm` (`@learny/llm`), dépendances AI SDK. Commit `feat(SPEC-504): crée le paquet llm`.
2. `tasks.ts`, `resolve.ts` (+ requêtes Drizzle via `serviceDb` restreint au `userId` explicite, car appelé par les jobs). Commit.
3. `providers/catalog.ts`, `providers/factory.ts`, `anthropic-options.ts`, `anthropic-fetch.ts`. Commit.
4. `mock/fixture-schema.ts`, `mock/select.ts`, `mock/mock-model.ts` ; dossier `fixtures/` avec `fixtures/tutor/demo.default.json` (texte « Bonjour ! »), `fixtures/tutor/demo-tool-call.json`, `fixtures/tutor/demo-refusal.json`, `fixtures/tutor/demo-timeout.json`, `fixtures/light/demo-object.json`, `fixtures/light/demo-invalid-object.json`. Commit.
5. `session.ts`, `errors.ts`, `log.ts` (insertion `ai_calls`), `files.ts`, `index.ts`. Commit.
6. Règles ESLint (frontières, motif `claude-`), démonstration, tests. Commits `test(SPEC-504): …`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/llm/{package.json,README.md}`, `packages/llm/src/{index,tasks,resolve,session,errors,log,files,anthropic-options,anthropic-fetch}.ts`, `packages/llm/src/providers/{catalog,factory}.ts`, `packages/llm/src/mock/{fixture-schema,select,mock-model}.ts`, `packages/llm/fixtures/**`, `packages/llm/fixtures/fixture.schema.json` (généré depuis Zod), `apps/web/app/_dev/sdd/_demos/spec-504.tsx`, tests §12.
- **Modifiés** : `packages/core/src/errors.ts` (codes ET-7, `AI_UNAVAILABLE` existant complété de `reason`), `eslint.config.js` (frontières), `.env.example` (`LLM_MODE`, `LLM_LIVE_TESTS`).
- **Lus** : `packages/config/src/{models,pricing,env}.ts`, `hasManagedAi` (SPEC-210).

## 10. Interface et conformité visuelle

Mode `demo`. Page `/_dev/sdd/SPEC-504` « SPEC-504 · Modèles et modèle simulé » :
- Tableau « Résolution » (`llm-resolution`) pour trois utilisateurs de test créés par la page : abonné (5 tâches → modèles Claude par défaut), non abonné avec clé OpenAI qualifiée sur `tutor` (tâche `tutor` → `openai`, autres → « Indisponible »), sans rien (5 × « Indisponible »).
- Formulaire « Appel simulé » : sélection de tâche (`llm-task`) et de scénario (`llm-scenario` : `demo`, `demo-tool-call`, `demo-refusal`, `demo-timeout`, `demo-object`, `demo-invalid-object`), bouton « Appeler » (`llm-call`), résultat (`llm-result` : texte, appels d'outils, ou code d'erreur) et dernière ligne `ai_calls` (`llm-last-call` : tâche, modèle, tokens, statut).
- Aperçu « Corps de requête Anthropic » (`llm-request-preview`) : JSON produit par `anthropic-options` pour la tâche choisie (sans clé).
- Contrôles visuels : jetons, structure, `toHaveScreenshot`.

## 11. Critères d'acceptation

- **CA-1** La résolution suit EF-1 pour 8 cas tabulés (abonné, non abonné avec clé qualifiée/non qualifiée/supprimée, `past_due`, surcharge Claude, ligne absente, modèle hors `model_ids`).
- **CA-2** Le corps envoyé à Anthropic pour chaque tâche contient `thinking.type = 'adaptive'`, l'effort d'ET-1, `tool_choice.type = 'auto'`, outils `strict`, `cache_control` sur la dernière partie stable, et ne contient ni `budget_tokens` ni `temperature` (MSW).
- **CA-3** Chaque type d'étape de fixture (texte, outils, objet, flux, 7 erreurs) est restitué fidèlement et converti dans le bon code d'erreur.
- **CA-4** La sélection de scénario suit l'ordre d'ADR-0153 (5 cas) et toutes les fixtures du dépôt sont valides et à jour de version.
- **CA-5** Chaque appel (réussi ou en erreur) produit exactement une ligne `ai_calls` correcte ; un appel refusé par `AI_UNAVAILABLE` n'en produit aucune.
- **CA-6** Aucun paquet hors `llm` n'importe un SDK de fournisseur ni un identifiant `claude-` en dur (test d'architecture).
- **CA-7** La page de démonstration montre la résolution et les six scénarios (vidéo).

## 12. Plan de tests

**Unitaires** (`describe('[SPEC-504] …')`) :
- `packages/llm/src/tasks.test.ts` : modèles par défaut = `models.ts` (BR-IA-01).
- `src/anthropic-options.test.ts` + `src/anthropic-fetch.test.ts` : corps de requête par tâche (CA-2), repli `fallbacks` (Opus/Sonnet seulement), refus de `citations` + structuré.
- `src/mock/select.test.ts` : ordre de sélection (CA-4), marqueur retiré, erreurs.
- `src/mock/fixtures.test.ts` : toutes les fixtures du dépôt valident `FixtureFileSchema` et `promptVersion` = version de la consigne (lu depuis `packages/tutor/prompts` si présent, sinon depuis la valeur déclarée `prompts/index.json`).
- `src/mock/mock-model.test.ts` : 11 types d'étapes (CA-3).
- `src/errors.test.ts` : conversion statut → code.
- `test/architecture.test.ts` : frontières (CA-6).

**Intégration** (`packages/llm/test/integration/resolve-and-log.test.ts`, `describe('[SPEC-504] résolution et journal')`, base réelle, fabriques) : 8 cas de CA-1 ; sessions mock avec journal `ai_calls` (CA-5) ; clé personnelle factice d'Anthropic avec MSW sur `https://api.anthropic.com/v1/messages` renvoyant 401 → `AI_KEY_INVALID` (CL-2) ; 529 → `AI_PROVIDER_ERROR` ; réponse `stop_reason: refusal` → `AI_REFUSED`.

**Injection** : `src/session.test.ts` « marqueur hors mock » — en `LLM_MODE=live` simulé (MSW), un texte contenant `[[mock:demo-refusal]]` est transmis tel quel et n'influence aucune sélection.

**End-to-end** (`apps/web/e2e/specs/p5/spec-504-llm.spec.ts`) : `test('résolution et scénarios simulés @SPEC-504', …)` : ouvrir la page, vérifier le tableau de résolution, exécuter les six scénarios et lire le code attendu et la ligne `ai_calls`. Vidéo.

**Visuel** : `test('démonstration llm @SPEC-504 @visual', …)` : jetons, structure, `toHaveScreenshot('spec-504-demo.png')`.

**Non-régression** : `[SPEC-110]`, `[SPEC-210]`, `@SPEC-201`.

| Critère | Tests |
|---|---|
| CA-1 | `resolve-and-log.test.ts` |
| CA-2 | `anthropic-options.test.ts`, `anthropic-fetch.test.ts` |
| CA-3 | `mock-model.test.ts`, `errors.test.ts` |
| CA-4 | `select.test.ts`, `fixtures.test.ts` |
| CA-5 | `resolve-and-log.test.ts` |
| CA-6 | `architecture.test.ts` |
| CA-7 | `spec-504-llm.spec.ts` (@SPEC-504, @visual) |

## 13. Preuves attendues

`evidence/SPEC-504/` : vidéo de la démonstration, capture du tableau de résolution et de l'aperçu de requête, rapports de tests, corps de requête Anthropic capturés par MSW (`evidence/SPEC-504/anthropic-request-<task>.json`, sans secret).

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7) ; aucun test automatisé n'atteint un fournisseur réel ; `README.md` du paquet décrit l'API publique et le format des fixtures.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0011, ADR-0013, ADR-0018, ADR-0019, ADR-0048, ADR-0066.
- Décision créée : **ADR-0153** (format des fixtures, sélection de scénario, marqueur `[[mock:…]]`).
- Décisions locales : la boucle d'outils n'est pas déléguée à l'AI SDK (`step` sans exécution) pour que SPEC-508 contrôle validation, garde-fous et journal à chaque tour ; la tâche `light` (effort « aucun » dans `ai.md`) utilise l'effort `low` car la réflexion ne peut pas être désactivée à tous les niveaux sur les modèles 5.5 ; le repli serveur sur refus est activé pour l'IA fournie Opus/Sonnet uniquement.
- Le coût réel, le plafond et les lots sont livrés par SPEC-507 via les crochets `costCalculator` et `budgetGuard`.
