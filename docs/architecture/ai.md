# Intelligence artificielle — normes d'implémentation

Normatif pour `packages/llm`, `packages/tutor`, `packages/ingestion`. Décisions : ADR-0019 à ADR-0023, ADR-0026, ADR-0048, ADR-0340 (la plateforme ne fournit aucun modèle ; l'ADR-0018 est remplacé).

## 1. Tâches et modèles

| Tâche (`ai_task`) | Usages | Effort de réflexion | Capacités exigées (qualification du modèle personnel) |
|---|---|---|---|
| `programme` | conception et ajustement du programme, structuration d'un import, recherche web | élevé | outils, sortie structurée, recherche web (sinon `SEARCH_API_KEY`) |
| `course` | rédaction du cours avec citations, fiches « À retenir », notions et liens | moyen | sortie structurée, références aux passages |
| `gaps` | analyse des lacunes, plan de remédiation, extraction du format d'examen | moyen | sortie structurée |
| `tutor` | discussion, questions et jeux, banques, correction (ouvertes, exercices, résumés), cadrage | faible | outils, sortie structurée |
| `light` | classification, découpage, titres, variantes simples, lecture d'images courtes | aucun | sortie structurée |

**Aucun modèle par défaut** (BR-IA-01, ADR-0340) : la plateforme ne fournit aucun modèle. Le modèle d'une tâche est celui que l'utilisateur a choisi parmi les modèles qualifiés de ses clés (`ai_task_models`) ; la résolution (`packages/llm/src/resolve.ts`) ne connaît que ce choix et renvoie `AI_UNAVAILABLE` sans repli quand il manque ou n'est plus qualifié. Aucun identifiant de modèle n'est écrit en dur dans le code ; les efforts de réflexion par tâche sont dans `packages/config/src/models.ts`. Les tarifs, quand ils existent, sont des valeurs de configuration révisables (`packages/config/src/pricing.ts`).

## 2. Accès aux modèles

- Bibliothèque : AI SDK (`ai`) avec les fournisseurs `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/mistral`, `@ai-sdk/deepseek`, `@ai-sdk/openai-compatible` (ADR-0019).
- Fonctions propres à Anthropic utilisées quand le fournisseur est Anthropic : outils stricts, sorties structurées, citations sur documents, API Files pour les PDF, recherche web serveur, mise en cache (`cacheControl` sur le contexte stable), API Batches pour les banques, réflexion adaptative (`thinking: { type: 'adaptive' }`) avec effort par tâche.
- Pour les autres fournisseurs, les substituts sont : recherche web via `SEARCH_API_KEY` (Tavily par défaut, ADR-0048), citations reconstruites par le code (chaque passage généré référence des `chunkId` vérifiés), texte PDF extrait à l'ingestion.
- `LLM_MODE` : `live` (production), `mock` (tests et CI ; défaut en local sans clé). En `mock`, `packages/llm` utilise `MockLanguageModel` (AI SDK `ai/test`) alimenté par des **fixtures** déterministes (`packages/llm/fixtures/<task>/<scenario>.json`), sélectionnées par une clé de scénario calculée sur l'entrée (ADR-0048). Aucun test automatisé n'appelle un vrai fournisseur ; un jeu de tests « live » optionnel est activé par `LLM_LIVE_TESTS=1`.

## 3. Registre d'actions du tuteur (`packages/tutor/src/tools/`)

Une action = un fichier exportant `{ name, description, inputSchema (Zod), outputSchema, guard(ctx, input), execute(ctx, input) }`. Les outils sont déclarés au modèle en mode strict.

| Action | Rôle | Garde-fou |
|---|---|---|
| `read_resources` | renvoie les passages utiles (recherche sémantique) d'un chapitre/module/formation | lecture seule ; budget de tokens par tâche (programme 6k, cours 24k, tuteur 4k, lacunes 8k) |
| `search_web` | conception du programme, suggestions de ressources | jamais inséré dans un cours ; tâche `programme` uniquement |
| `create_or_update` | crée/modifie un objet de structure (module, chapitre, notion, lien) ou une brique | schéma du type ; propriétaire = utilisateur courant ; une modification crée une version |
| `assemble_activity` | regroupe des briques en activité | toutes les briques valides et appartenant à l'utilisateur |
| `schedule` | place une activité dans l'agenda | délègue au planificateur (respect des disponibilités) |
| `schedule_reminder` | programme une relance | passe par le service de notifications (heures calmes, plafond) |
| `get_due_notions` | interroge FSRS | dates calculées par le moteur, jamais par le modèle |
| `read_results` | résultats et état de mémorisation | lecture seule |
| `grade_answer` | note et retour sur une réponse ouverte, une production, un dialogue, un résumé | note bornée par le barème |
| `prepare_question_bank` | variantes par notion et format | lancée en lot ; seulement si banque épuisée |

## 4. Boucle agent (`packages/tutor/src/loop.ts`)

1. Construire le contexte : instructions système de la tâche (`prompts/<task>.md`), profil (ton, langue), contexte stable mis en cache, données (passages balisés `<document source="…" chunk="…">…</document>`).
2. Appeler le modèle via `llm.generate({ userId, task, tools, ... })`.
3. Pour chaque appel d'outil : valider l'entrée (Zod) → `guard` → `execute` dans une transaction ; une erreur est renvoyée au modèle comme résultat d'outil en erreur.
4. Arrêt : fin de tour, ou 12 tours maximum, ou 2 erreurs de validation consécutives sur la même brique (→ échec `INVALID_OUTPUT`, BR-IA-05/11).
5. Journaliser chaque appel (`ai_calls`) avec coût.

## 5. Rédaction des consignes (prompts)

- Fichiers Markdown versionnés dans `packages/tutor/prompts/`, un par tâche/scénario, avec en-tête `version:` ; tout changement de consigne incrémente la version et met à jour les fixtures de test concernées.
- Consignes en anglais (meilleure adhérence) ; le contenu produit pour l'apprenant est dans `course_language` ; le ton (`vous`/`tu`) est imposé par une variable (`{{tone}}`).
- Les apports sont toujours dans des balises de données ; la consigne précise que leur contenu n'est jamais une instruction (BR-IA-10).
- Règles pédagogiques à inclure selon la tâche : tester avant de réexpliquer, varier les formats, fiche « À retenir » par chapitre, signaler ce qui vient des connaissances du tuteur, citer les sources, ne jamais inventer de source.

## 6. Coûts

Aucun plafond ni garde-fou de dépense : les appels sont faits avec la clé de l'utilisateur, qui paie directement son fournisseur (ADR-0340, BR-IA-07 retirée). Chaque appel reste journalisé (BR-IA-08) avec ses tokens et son coût estimé, agrégés par formation et par jour.
