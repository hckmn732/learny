# Intelligence artificielle — normes d'implémentation

Normatif pour `packages/llm`, `packages/tutor`, `packages/ingestion`. Décisions : ADR-0018 à ADR-0023, ADR-0026, ADR-0048.

## 1. Tâches et modèles

| Tâche (`ai_task`) | Usages | Modèle IA fournie | Effort de réflexion | Capacités exigées (qualification BYOK) |
|---|---|---|---|---|
| `programme` | conception et ajustement du programme, structuration d'un import, recherche web | `claude-opus-5-5` | élevé | outils, sortie structurée, recherche web (sinon `SEARCH_API_KEY`) |
| `course` | rédaction du cours avec citations, fiches « À retenir », notions et liens | `claude-opus-5-5` | moyen | sortie structurée, références aux passages |
| `gaps` | analyse des lacunes, plan de remédiation, extraction du format d'examen | `claude-opus-5-5` | moyen | sortie structurée |
| `tutor` | discussion, questions et jeux, banques, correction (ouvertes, exercices, résumés), cadrage | `claude-sonnet-5-5` | faible | outils, sortie structurée |
| `light` | classification, découpage, titres, variantes simples, lecture d'images courtes | `claude-haiku-5-5` | aucun | sortie structurée |

Identifiants centralisés dans `packages/config/src/models.ts`. Tarifs dans `packages/config/src/pricing.ts` (USD par million de tokens, entrée/sortie/lecture cache/écriture cache) pour le calcul de coût ; ils sont des valeurs de configuration révisables.

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

Garde-fou avant chaque appel (`packages/llm/src/budget.ts`) : estimation des tokens (compte approximatif 4 caractères = 1 token + plafond de sortie) ; si `managed` et dépense du jour + estimation > plafond → bascule `light` (Haiku) ou report (tâche `programme`), journal `status='capped'`. Alerte à 80 % (notification `ai_cost_alert`, une fois par jour).
