---
id: SPEC-512
title: "Recherche web"
phase: P5
priority: V1
depends_on: [SPEC-504]
business_rules: [BR-IA-12, BR-APP-05]
screens: []
adrs: [ADR-0048]
visual: demo
---

# SPEC-512 — Recherche web

## 1. Objectif

Outil search_web : recherche serveur Anthropic ou repli Tavily, normalisation des résultats, usage restreint à la tâche programme et aux suggestions de ressources. La livraison est vérifiable par les contrats, les états d’interface et les critères de la section 11.

## 2. Contexte

Lire `docs/product/business-rules.md` (BR-IA-12, BR-APP-05), `docs/architecture/ai.md`, `docs/architecture/data-model.md` §3, §5 et §9, `docs/architecture/overview.md` §4, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. ADR applicables : ADR-0048. Les appels modèle passent par `@learny/llm` ; les tests emploient seulement `LLM_MODE=mock`.

## 3. Dépendances

- **SPEC-504** — capacité de recherche du fournisseur et mock.
- Les tests automatiques utilisent `LLM_MODE=mock`, des fixtures versionnées et une horloge fixée à `2026-11-11T12:20:00Z`. Aucune clé personnelle ni appel réel à un fournisseur n’entre dans les preuves.

## 4. Règles métier couvertes

- **BR-IA-12** — La recherche web ne sert qu'à concevoir le programme et à suggérer des ressources ; son résultat n'entre jamais tel quel dans un cours.
- **BR-APP-05** — Le tuteur peut suggérer des ressources trouvées sur le web pour un chapitre (titre, URL, raison) ; l'apprenant les importe ou les ignore.

## 5. Exigences fonctionnelles

- **EF-1** — Exposer `search_web` dans le registre du tuteur uniquement pour la tâche `programme` et pour les suggestions de ressources ; l’outil est refusé lors de `course`, `gaps`, `tutor` ou correction.
- **EF-2** — Utiliser la recherche serveur Anthropic quand le fournisseur courant la permet ; sinon l’API de repli Tavily configurée par `SEARCH_API_KEY` (ADR-0048).
- **EF-3** — Normaliser les résultats en `{title,url,snippet,publishedAt?,provider}` avec URL HTTP(S) publique et déduplication par URL canonique ; limiter le texte transmis au modèle au budget de la tâche.
- **EF-4** — Les résultats web peuvent aider à proposer la structure d’un programme ou une ressource que l’apprenant choisira d’importer ; ils n’entrent jamais tels quels dans le cours ou ses citations.
- **EF-5** — Une recherche indisponible retourne une erreur explicite et un parcours de programme qui signale la limitation, sans source ni résultat inventé.

## 6. Exigences techniques

- **ET-1** — `searchWeb(ctx, {query,purpose,limit})` vérifie `ctx.task === programme` et `purpose ∈ {programme,resource_suggestion}` avant toute requête.
- **ET-2** — `normalizeSearchResults(raw)` valide URL publique, supprime doublons et HTML actif, conserve titre/extrait et provenance fournisseur.
- **ET-3** — Les clés Anthropic/Tavily restent dans `@learny/llm` côté serveur ; les fixtures mock permettent de vérifier les deux routes fournisseur sans réseau.
- **ET-4** — Les entrées et sorties sont validées par Zod ; l’accès aux données passe par le client utilisateur et RLS, les opérations système par un service explicitement autorisé. Les secrets et contenus d’apports ne figurent pas dans les journaux.
- **ET-5** — Les scénarios de test utilisent des fixtures déterministes, un fournisseur simulé et l’horloge injectable. Les échecs externes rendent un code et un message sûrs, sans bascule payante automatique ni résultat inventé.

## 7. Comportements attendus et cas limites

- **CL-1** — Outil appelé depuis la rédaction du cours : refus `TOOL_NOT_ALLOWED`, aucun appel réseau.
- **CL-2** — Clé Tavily absente pour un fournisseur sans recherche native : erreur `SEARCH_UNAVAILABLE`.
- **CL-3** — Résultat avec URL privée ou javascript: : supprimé avant modèle/UI.
- **CL-4** — Deux liens redirigeant vers la même URL canonique : un seul résultat.
- **CL-5** — Résultat vide : liste vide et message honnête, jamais une source inventée.

## 8. Instructions d'implémentation

1. Définir les contrats Zod et les fixtures `LLM_MODE=mock` du scénario ; vérifier les décisions ADR avant toute nouvelle valeur.
2. Implémenter `packages/tutor/src/tools/search-web.ts` et ses services en séparant validation, accès aux données et appel à `@learny/llm`. Commits atomiques `feat(SPEC-512): …`.
3. Ajouter la page de démonstration SDD avec états succès, absence de données et erreur sûre ; aucune clé ni donnée privée n’est rendue.
4. Écrire tests unitaires, intégration avec RLS et e2e filmé, puis contrôle visuel et axe. Commit `test(SPEC-512): …`.
5. Exécuter `validate.mjs SPEC-512`, renseigner chaque CA avec une preuve réelle et terminer par `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/tutor/src/tools/search-web.ts`, `packages/llm/src/search/anthropic.ts`, `packages/llm/src/search/tavily.ts`, `packages/llm/src/search/normalize.ts`, `packages/tutor/src/tools/search-web.test.ts`, `packages/tutor/test/integration/search-web.test.ts`, `apps/web/components/sdd-demos/spec-512.tsx`, `apps/web/e2e/specs/p5/spec-512.spec.ts`.
- **Modifiés** : `packages/contracts/src/index.ts`, `packages/jobs/src/functions/index.ts` si un job est introduit, `apps/web/app/%5Fdev/sdd/registry.ts`, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `@learny/llm`, `@learny/contracts`, `@learny/db`, fixtures mock et services des dépendances ; dépendances SPEC-504.

## 10. Interface et conformité visuelle

Mode `demo`. Page SDD : tâche programme sélectionnée, résultats de fixture avec provenance et action « Suggérer » ; tâche cours montre `TOOL_NOT_ALLOWED`, sans bouton d’import automatique. Page `/_dev/sdd/SPEC-512` : afficher le scénario simulé, le contrat d’entrée, le résultat validé et un échec lisible, sans clé ni contenu privé. Mode `demo` : jetons, structure, axe et capture desktop/mobile à 1 %. Aucun appel à un fournisseur réel dans le navigateur.

## 11. Critères d'acceptation

- **CA-1** — Une tâche programme peut rechercher via Anthropic ou Tavily selon la capacité du fournisseur, avec même schéma de résultat.
- **CA-2** — Les tâches cours/tuteur/lacunes refusent `search_web` avant tout appel au fournisseur.
- **CA-3** — Les URL invalides/privées et doublons sont exclus, avec provenance de chaque résultat conservée.
- **CA-4** — Aucun résultat de recherche n’est inséré tel quel dans un cours ; une suggestion nécessite l’action d’import de l’apprenant.
- **CA-5** — La démonstration compare route native/repli et refus, avec vidéo, axe et `@visual`.

## 12. Plan de tests

- **Unitaires** — `packages/tutor/src/tools/search-web.test.ts`, `describe('[SPEC-512] Recherche web')` : autorisation par tâche et normalisation des URL, validation Zod et erreurs simulées (CA-1 à CA-3).
- **Intégration** — `packages/tutor/test/integration/search-web.test.ts`, `describe('[SPEC-512] service')` : fournisseurs mock Anthropic/Tavily et absence de clé, RLS de deux utilisateurs, fournisseur simulé et reprise idempotente (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p5/spec-512.spec.ts`, `test('Recherche web @SPEC-512')` : résultats de programme puis refus pour cours dans la démonstration, vidéo et capture (CA-1, CA-5).
- **Visuel** — `test('Recherche web @SPEC-512 @visual')` : jetons, structure, axe, desktop/mobile à 1 % (CA-5).
- **Non-régression** — rejouer les étiquettes `[SPEC-504]` / `@SPEC-504`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; e2e |
| CA-2 | unitaires ; intégration |
| CA-3 | unitaires ; intégration |
| CA-4 | intégration |
| CA-5 | e2e ; @visual |

## 13. Preuves attendues

`evidence/SPEC-512/` contient `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, une vidéo réelle du scénario `@SPEC-512`, captures desktop/mobile, comparaisons visuelles applicables et `acceptance.md` reliant chaque CA au test et à sa sortie. Aucune capture ou réussite n’est déclarée sans fichier effectivement généré.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 est remplie : lint, typecheck, build, tests unitaires et d’intégration filtrés, e2e avec vidéo, au moins un test `@visual`, axe, preuves et absence de régression. Le fournisseur simulé couvre le succès et les erreurs ; aucune clé ou donnée privée n’apparaît dans les preuves et aucun appel réel n’a lieu en CI.

## 15. Décisions et hypothèses

Décisions appliquées : ADR-0048. Les valeurs normatives viennent des règles métier et de la maquette ; aucune valeur produit n’est introduite hors du catalogue. Toute ambiguïté d’implémentation découverte ensuite suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification de la spécification.
