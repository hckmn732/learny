# ADR-4005 — Passerelle LLM réelle du backend Python

- **Statut** : Acceptée
- **Origine** : Validée (demande du porteur du projet, 2026-11-24)
- **Date** : 2026-11-24
- **Liens** : ADR-0340, ADR-0341, ADR-2011, ADR-2042, ADR-2043, SPEC-504, SPEC-505, SPEC-506, SPEC-2201, SPEC-2204

## Contexte

Le backend Python ne livrait que l'adaptateur simulé de `LlmGateway` (SPEC-2201) : `build_llm` levait une erreur dès que le mode d'IA, dérivé d'`APP_ENV` (ADR-2042), n'était pas `mock`. Le paquet TypeScript `packages/llm`, qui appelait les fournisseurs, a été retiré avec le backend TypeScript (SPEC-2302, ADR-2043, commit `44d339f5`).

Conséquences :
- aucune fonction d'IA ne marchait hors simulation ;
- la façade refusait de démarrer sur un environnement réel, ce qui bloquait le redéploiement de la QA ;
- aucun appel n'était journalisé dans `ai_calls` ;
- la qualification d'une clé personnelle (BYOK) ne sollicitait jamais le vrai modèle.

Le protocole Python avait aussi perdu le contexte `{userId, db}` de `createSession` : la passerelle ne savait pas pour quel apprenant résoudre le modèle et la clé.

## Décision

1. **`LiveGateway`** (`learny/platform/llm/live.py`) implémente `LlmGateway` hors simulation. `build_llm(settings, db)` renvoie le mock quand le mode dérivé vaut `mock`, et la passerelle réelle sinon.
2. **Deux formats d'échange couvrent les six fournisseurs du catalogue** :
   - l'API Messages d'Anthropic, avec cache du contexte stable, documents de l'API Files, citations, recherche web côté fournisseur et outils ;
   - l'API chat completions d'OpenAI, parlée par OpenAI, Mistral, DeepSeek, les services compatibles et les serveurs locaux.

   Pas de SDK : `httpx`, déjà présent (ADR-2015).
3. **Sorties structurées.**
   - Anthropic : un outil `structured_output` forcé, dont le schéma est celui du modèle Pydantic.
   - OpenAI : `response_format` `json_schema` strict, avec un schéma rendu strict (objets fermés, toutes les propriétés requises) ; si le mode strict est refusé, une seule reprise en mode JSON.
   - Autres fournisseurs : mode JSON, avec le schéma dans le contexte système.
   - Une sortie non conforme lève `INVALID_OUTPUT`. Les corrections restent à l'appelant (BR-IA-11).
4. **Appelant IA.** Les cas d'usage ne transmettent pas l'identifiant de l'apprenant à chaque prompt. Deux points d'entrée le fixent dans une `ContextVar`, comme le fait déjà `collect_committed_events` :
   - le pipeline de l'API, pour l'acteur authentifié et la formation `fid` du chemin ;
   - le worker et les jobs en ligne, pour `event.user_id` et `formationId`.

   Deux sites le passent explicitement :
   - le flux du tuteur, dont le corps est lu après la fin de la requête ;
   - la qualification BYOK, qui vise un modèle et une clé précis (`model`, `api_key`), avant toute affectation à une tâche.

   Un appel sans appelant lève `AI_UNAVAILABLE` (`reason: no_caller`) au lieu de deviner.
5. **Clé.** Le modèle vient de `ai_task_models` (`resolve_task_model`, inchangé). La clé est lue dans `ai_credentials`, filtrée par `user_id`, puis déchiffrée (AES-256-GCM, trousseau `APP_ENCRYPTION_KEY` et `APP_ENCRYPTION_KEY_PREVIOUS`) juste avant l'appel. Elle n'est ni journalisée ni renvoyée.
6. **Journal.** Chaque appel écrit exactement une ligne `ai_calls` (BR-IA-08) :
   - jetons, latence, statut (`ok`, `error`, `refused`, `invalid_output`) et code d'erreur ;
   - `managed = false` et coût nul : la plateforme ne facture pas la clé de l'apprenant (ADR-0340).

   Une panne du journal n'efface jamais la réponse du modèle. `learny.platform.llm.live` rejoint la liste fermée des appelants privilégiés.
7. **Erreurs.** Les échecs HTTP deviennent les codes du catalogue, avec les textes de `packages/llm/src/errors.ts` copiés dans `locale_fr/ai.py` :

   | Situation | Code |
   |---|---|
   | 401 ou 403 | `AI_KEY_INVALID` |
   | 429 | `AI_RATE_LIMITED` |
   | 408, 504 ou délai dépassé | `AI_TIMEOUT` |
   | Contexte trop long | `AI_CONTEXT_TOO_LONG` |
   | Refus | `AI_REFUSED` |
   | Autres échecs | `AI_PROVIDER_ERROR` |

## Conséquences

- Le point ouvert d'ADR-2042 est levé : la façade démarre sur un environnement réel (`preview`, `staging`, `production`) et sert l'IA avec la clé de chaque apprenant.
- Les essais restent déterministes : les tests unitaires utilisent un transport `httpx` simulé, et les suites d'intégration et e2e gardent le mock (`APP_ENV` local ou de test).
- Non porté dans cette décision : l'effort de réflexion adaptatif par tâche et le traitement par lots côté fournisseur (BR-IA-13). Les appels partent en mode direct avec le budget de sortie et le délai de `TASK_CONFIG`.
