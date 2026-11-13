---
id: SPEC-511
title: "Recherche sémantique et sélection du contexte"
phase: P5
priority: V1
depends_on: [SPEC-509]
business_rules: []
screens: []
adrs: [ADR-0056]
visual: demo
---

# SPEC-511 — Recherche sémantique et sélection du contexte

## 1. Objectif

Recherche cosinus filtrée par utilisateur/formation/chapitre, budget de tokens par tâche, déduplication, formatage en balises de données avec identifiants de passage. La livraison est vérifiable par les contrats, les états d’interface et les critères de la section 11.

## 2. Contexte

Lire `docs/product/business-rules.md` (règles transverses), `docs/architecture/ai.md`, `docs/architecture/data-model.md` §3, §5 et §9, `docs/architecture/overview.md` §4, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. ADR applicables : ADR-0056. Les appels modèle passent par `@learny/llm` ; les tests emploient seulement `LLM_MODE=mock`.

## 3. Dépendances

- **SPEC-509** — passages vectoriels indexés et propriété.
- Les tests automatiques utilisent `LLM_MODE=mock`, des fixtures versionnées et une horloge fixée à `2026-11-11T12:20:00Z`. Aucune clé personnelle ni appel réel à un fournisseur n’entre dans les preuves.

## 4. Règles métier couvertes

Aucune règle métier directe ; les contraintes transverses du produit et les ADR cités restent applicables.

## 5. Exigences fonctionnelles

- **EF-1** — Chercher les passages les plus proches par cosinus pgvector dans `resource_chunks`, filtrés d’abord par propriétaire, formation et éventuellement chapitre ; un identifiant étranger ne produit aucun résultat.
- **EF-2** — Dédupliquer les passages identiques ou se chevauchant et conserver un ordre stable par score, source et position.
- **EF-3** — Respecter les budgets de contexte de `docs/architecture/ai.md` : programme 6 000, cours 24 000, tuteur 4 000, lacunes 8 000 tokens ; ne jamais tronquer au milieu d’une référence de passage.
- **EF-4** — Formatter chaque extrait sous balises de données avec source, `chunkId`, emplacement et texte échappé ; aucune chaîne de ressource ne devient une instruction système.
- **EF-5** — Retourner une liste vide avec raison `no_matches` quand rien n’est admissible ; les tâches appelantes décident si elles peuvent poursuivre sans source.

## 6. Exigences techniques

- **ET-1** — `searchRelevantChunks(ctx, {formationId, chapterId?, queryEmbedding, limit})` exécute une requête paramétrée `vector_cosine_ops` sous RLS et retourne score, chunkId, resourceId et location.
- **ET-2** — `selectContext(chunks, task, tokenBudget)` trie, déduplique et réserve le coût des balises/attributions avant d’ajouter un passage ; l’ordre reste déterministe.
- **ET-3** — `formatDocumentChunk(chunk)` échappe les attributs et le texte dans `<document source="…" chunk="…">…</document>` ; les identifiants sont vérifiés côté base avant usage.
- **ET-4** — Les entrées et sorties sont validées par Zod ; l’accès aux données passe par le client utilisateur et RLS, les opérations système par un service explicitement autorisé. Les secrets et contenus d’apports ne figurent pas dans les journaux.
- **ET-5** — Les scénarios de test utilisent des fixtures déterministes, un fournisseur simulé et l’horloge injectable. Les échecs externes rendent un code et un message sûrs, sans bascule payante automatique ni résultat inventé.

## 7. Comportements attendus et cas limites

- **CL-1** — Passage d’un autre utilisateur dans une formation commune : jamais renvoyé.
- **CL-2** — Query embedding de dimension autre que 1024 : validation en échec avant SQL.
- **CL-3** — Budget insuffisant pour un passage et son attribution : passage omis, budget non dépassé.
- **CL-4** — Deux passages fortement chevauchants : un seul dans le contexte.
- **CL-5** — Texte contenant une fausse fermeture `</document>` : échappé comme donnée.

## 8. Instructions d'implémentation

1. Définir les contrats Zod et les fixtures `LLM_MODE=mock` du scénario ; vérifier les décisions ADR avant toute nouvelle valeur.
2. Implémenter `packages/ingestion/src/retrieval/search-context.ts` et ses services en séparant validation, accès aux données et appel à `@learny/llm`. Commits atomiques `feat(SPEC-511): …`.
3. Ajouter la page de démonstration SDD avec états succès, absence de données et erreur sûre ; aucune clé ni donnée privée n’est rendue.
4. Écrire tests unitaires, intégration avec RLS et e2e filmé, puis contrôle visuel et axe. Commit `test(SPEC-511): …`.
5. Exécuter `validate.mjs SPEC-511`, renseigner chaque CA avec une preuve réelle et terminer par `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/ingestion/src/retrieval/search-context.ts`, `packages/ingestion/src/retrieval/select-context.ts`, `packages/ingestion/src/retrieval/format-document.ts`, `packages/ingestion/src/retrieval/search-context.test.ts`, `packages/ingestion/test/integration/search-context.test.ts`, `apps/web/components/sdd-demos/spec-511.tsx`, `apps/web/e2e/specs/p5/spec-511.spec.ts`.
- **Modifiés** : `packages/contracts/src/index.ts`, `packages/jobs/src/functions/index.ts` si un job est introduit, `apps/web/app/%5Fdev/sdd/registry.ts`, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `@learny/llm`, `@learny/contracts`, `@learny/db`, fixtures mock et services des dépendances ; dépendances SPEC-509.

## 10. Interface et conformité visuelle

Mode `demo`. Page SDD : requête fictive, résultats classés avec source/score, jauge de budget et aperçu des balises de données ; un passage piégé montre son échappement. Page `/_dev/sdd/SPEC-511` : afficher le scénario simulé, le contrat d’entrée, le résultat validé et un échec lisible, sans clé ni contenu privé. Mode `demo` : jetons, structure, axe et capture desktop/mobile à 1 %. Aucun appel à un fournisseur réel dans le navigateur.

## 11. Critères d'acceptation

- **CA-1** — Une recherche de fixture ordonne les passages par similarité cosinus, mais n’inclut aucun passage d’un second membre du groupe.
- **CA-2** — Les budgets 6k/24k/4k/8k incluent balises et identifiants et ne sont jamais dépassés.
- **CA-3** — Passages dupliqués ou chevauchants sont dédupliqués et ordre stable à entrées permutées.
- **CA-4** — Un texte injectant `</document>` reste contenu dans les balises et ne crée aucune instruction hors donnée.
- **CA-5** — La démonstration montre scores, budget et balises sûres avec vidéo, axe et `@visual`.

## 12. Plan de tests

- **Unitaires** — `packages/ingestion/src/retrieval/search-context.test.ts`, `describe('[SPEC-511] Recherche sémantique et sélection du contexte')` : déduplication, budgets et échappement, validation Zod et erreurs simulées (CA-1 à CA-3).
- **Intégration** — `packages/ingestion/test/integration/search-context.test.ts`, `describe('[SPEC-511] service')` : cosinus pgvector sous RLS à deux utilisateurs, RLS de deux utilisateurs, fournisseur simulé et reprise idempotente (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p5/spec-511.spec.ts`, `test('Recherche sémantique et sélection du contexte @SPEC-511')` : lecture du contexte choisi et jauge de tokens dans la démonstration, vidéo et capture (CA-1, CA-5).
- **Visuel** — `test('Recherche sémantique et sélection du contexte @SPEC-511 @visual')` : jetons, structure, axe, desktop/mobile à 1 % (CA-5).
- **Non-régression** — rejouer les étiquettes `[SPEC-509]` / `@SPEC-509`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; e2e |
| CA-2 | unitaires ; intégration |
| CA-3 | unitaires ; intégration |
| CA-4 | intégration |
| CA-5 | e2e ; @visual |

## 13. Preuves attendues

`evidence/SPEC-511/` contient `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, une vidéo réelle du scénario `@SPEC-511`, captures desktop/mobile, comparaisons visuelles applicables et `acceptance.md` reliant chaque CA au test et à sa sortie. Aucune capture ou réussite n’est déclarée sans fichier effectivement généré.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 est remplie : lint, typecheck, build, tests unitaires et d’intégration filtrés, e2e avec vidéo, au moins un test `@visual`, axe, preuves et absence de régression. Le fournisseur simulé couvre le succès et les erreurs ; aucune clé ou donnée privée n’apparaît dans les preuves et aucun appel réel n’a lieu en CI.

## 15. Décisions et hypothèses

Décisions appliquées : ADR-0056, ADR-0300. Les valeurs normatives viennent des règles métier et de la maquette ; aucune valeur produit n’est introduite hors du catalogue. Toute ambiguïté d’implémentation découverte ensuite suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification de la spécification.
