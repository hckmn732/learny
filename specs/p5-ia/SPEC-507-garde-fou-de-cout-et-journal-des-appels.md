---
id: SPEC-507
title: "Garde-fou de coût et journal des appels"
phase: P5
priority: V1
depends_on: [SPEC-504, SPEC-210]
business_rules: [BR-IA-07, BR-IA-08, BR-IA-13]
screens: []
adrs: [ADR-0012, ADR-0073]
visual: demo
---

# SPEC-507 — Garde-fou de coût et journal des appels

## 1. Objectif

Estimation avant appel, dépense du jour, alerte 80 %, bascule Haiku, report de la tâche programme, calcul du coût réel (cache, lots), table ai_calls, agrégats par formation/jour, API /me/ai/usage, API Batches pour les tâches différées. La livraison est vérifiable par les contrats, les états d’interface et les critères de la section 11.

## 2. Contexte

Lire `docs/product/business-rules.md` (BR-IA-07, BR-IA-08, BR-IA-13), `docs/architecture/ai.md`, `docs/architecture/data-model.md` §3, §5 et §9, `docs/architecture/overview.md` §4, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. ADR applicables : ADR-0012, ADR-0073. Les appels modèle passent par `@learny/llm` ; les tests emploient seulement `LLM_MODE=mock`.

## 3. Dépendances

- **SPEC-504** — résolution des modèles et contrat d’appel.
- **SPEC-210** — statut abonnement et plafond individuel.
- Les tests automatiques utilisent `LLM_MODE=mock`, des fixtures versionnées et une horloge fixée à `2026-11-11T12:20:00Z`. Aucune clé personnelle ni appel réel à un fournisseur n’entre dans les preuves.

## 4. Règles métier couvertes

- **BR-IA-07** — Plafond quotidien de dépense de l'IA fournie par apprenant : 1,50 USD par jour (réglable par l'exploitant via configuration). Alerte in-app à 80 %. Au plafond, toutes les tâches basculent sur `claude-haiku-5-5` jusqu'à minuit (fuseau de l'utilisateur). Les tâches qui exigent un modèle supérieur et ne peuvent être faites par Haiku (conception du programme) sont reportées au lendemain avec notification.
- **BR-IA-08** — Chaque appel IA est journalisé : utilisateur, formation, tâche, fournisseur, modèle, tokens d'entrée/sortie/cache, coût estimé (USD), latence, statut, mode lot ou non. Les coûts sont agrégés par formation et par jour.
- **BR-IA-13** — Le contexte stable d'une formation (instructions, outils, programme) est mis en cache côté fournisseur quand c'est possible ; les générations non urgentes (banques de questions) passent par l'API de traitement par lots.

## 5. Exigences fonctionnelles

- **EF-1** — Avant chaque appel d’IA fournie, estimer les tokens d’entrée et de sortie, le coût selon fournisseur/modèle/cache/lot et la dépense du jour local de l’apprenant ; la clé personnelle ne consomme pas ce plafond.
- **EF-2** — Au seuil de 80 % d’un plafond par défaut de 1,50 USD/jour, créer une seule notification in-app `ai_cost_alert` pour le jour utilisateur.
- **EF-3** — Au plafond, choisir `claude-haiku-5-5` pour les tâches compatibles jusqu’au minuit local ; reporter `programme` au lendemain avec notification plutôt que de le dégrader.
- **EF-4** — Journaliser chaque appel dans `ai_calls` : utilisateur, formation, tâche, fournisseur, modèle, tokens entrée/sortie/cache, coût USD, latence, statut et indicateur lot ; agréger par formation et jour.
- **EF-5** — Exposer `GET /api/v1/me/ai/usage` avec dépense, plafond, pourcentage, prochain renouvellement local et historique de coûts ; lancer les banques non urgentes par API Batches lorsque le fournisseur le permet.

## 6. Exigences techniques

- **ET-1** — `checkBudget({ userId, task, model, estimatedTokens, at, capUsd, spentUsd })` retourne `allow|downgrade|defer` et le modèle effectif, sans effet de bord.
- **ET-2** — `recordAiCall(ctx, usage)` persiste dans `ai_calls` même pour refus/échec avec coût réellement facturé ou 0 si aucun appel ; utiliser les tarifs de `packages/config/src/pricing.ts` (ADR-0073).
- **ET-3** — La vue `ai_spend_today` est évaluée dans le fuseau du profil, en USD `numeric(12,6)`, et la notification 80 % possède une clé de déduplication par utilisateur/jour.
- **ET-4** — Les entrées et sorties sont validées par Zod ; l’accès aux données passe par le client utilisateur et RLS, les opérations système par un service explicitement autorisé. Les secrets et contenus d’apports ne figurent pas dans les journaux.
- **ET-5** — Les scénarios de test utilisent des fixtures déterministes, un fournisseur simulé et l’horloge injectable. Les échecs externes rendent un code et un message sûrs, sans bascule payante automatique ni résultat inventé.

## 7. Comportements attendus et cas limites

- **CL-1** — Appel estimé à cheval sur le plafond : décision conservatrice avant appel, pas de dépassement silencieux.
- **CL-2** — Minuit UTC différent du minuit local : compteur ne revient à zéro qu’au jour du profil.
- **CL-3** — Tarif absent pour un modèle personnel : usage enregistré sans inventer un coût fournisseur.
- **CL-4** — API Batches indisponible : job différé échoue lisiblement ou utilise le chemin non lot seulement si le plafond le permet.
- **CL-5** — Deux appels simultanés près du plafond : réservation transactionnelle pour empêcher double dépense non contrôlée.

## 8. Instructions d'implémentation

1. Définir les contrats Zod et les fixtures `LLM_MODE=mock` du scénario ; vérifier les décisions ADR avant toute nouvelle valeur.
2. Implémenter `packages/llm/src/budget/check.ts` et ses services en séparant validation, accès aux données et appel à `@learny/llm`. Commits atomiques `feat(SPEC-507): …`.
3. Ajouter la page de démonstration SDD avec états succès, absence de données et erreur sûre ; aucune clé ni donnée privée n’est rendue.
4. Écrire tests unitaires, intégration avec RLS et e2e filmé, puis contrôle visuel et axe. Commit `test(SPEC-507): …`.
5. Exécuter `validate.mjs SPEC-507`, renseigner chaque CA avec une preuve réelle et terminer par `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/llm/src/budget/check.ts`, `packages/llm/src/budget/price.ts`, `packages/llm/src/budget/check.test.ts`, `packages/services/src/ai/usage.ts`, `apps/web/app/api/v1/me/ai/usage/route.ts`, `packages/services/test/integration/ai-budget.test.ts`, `apps/web/components/sdd-demos/spec-507.tsx`, `apps/web/e2e/specs/p5/spec-507.spec.ts`.
- **Modifiés** : `packages/contracts/src/index.ts`, `packages/jobs/src/functions/index.ts` si un job est introduit, `apps/web/app/%5Fdev/sdd/registry.ts`, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `@learny/llm`, `@learny/contracts`, `@learny/db`, fixtures mock et services des dépendances ; dépendances SPEC-504, SPEC-210.

## 10. Interface et conformité visuelle

Mode `demo`. Page SDD : barre de dépense 0–1,50 USD, jalon 80 %, modèle choisi, table d’appels factices et date du prochain minuit local ; aucun prix inventé hors configuration. Page `/_dev/sdd/SPEC-507` : afficher le scénario simulé, le contrat d’entrée, le résultat validé et un échec lisible, sans clé ni contenu privé. Mode `demo` : jetons, structure, axe et capture desktop/mobile à 1 %. Aucun appel à un fournisseur réel dans le navigateur.

## 11. Critères d'acceptation

- **CA-1** — Avec plafond 1,50 USD, une dépense de 1,20 USD déclenche une seule alerte à 80 % pour le jour local.
- **CA-2** — Au plafond, une tâche compatible utilise Haiku ; `programme` est reportée au lendemain local et notifiée.
- **CA-3** — Les appels simultanés ne contournent pas le plafond et les clés personnelles ne le consomment pas.
- **CA-4** — Chaque appel et refus possède une ligne `ai_calls` complète ; l’API usage agrège correctement par formation et jour.
- **CA-5** — La démonstration montre estimation, alerte et report du mock avec vidéo, axe et test `@visual`.

## 12. Plan de tests

- **Unitaires** — `packages/llm/src/budget/check.test.ts`, `describe('[SPEC-507] Garde-fou de coût et journal des appels')` : estimation, seuil 80 %, modèle Haiku et report, validation Zod et erreurs simulées (CA-1 à CA-3).
- **Intégration** — `packages/services/test/integration/ai-budget.test.ts`, `describe('[SPEC-507] service')` : transactions concurrentes et agrégats ai_calls, RLS de deux utilisateurs, fournisseur simulé et reprise idempotente (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p5/spec-507.spec.ts`, `test('Garde-fou de coût et journal des appels @SPEC-507')` : variation de dépense et état du plafond dans la démonstration, vidéo et capture (CA-1, CA-5).
- **Visuel** — `test('Garde-fou de coût et journal des appels @SPEC-507 @visual')` : jetons, structure, axe, desktop/mobile à 1 % (CA-5).
- **Non-régression** — rejouer les étiquettes `[SPEC-504]` / `@SPEC-504`, `[SPEC-210]` / `@SPEC-210`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; e2e |
| CA-2 | unitaires ; intégration |
| CA-3 | unitaires ; intégration |
| CA-4 | intégration |
| CA-5 | e2e ; @visual |

## 13. Preuves attendues

`evidence/SPEC-507/` contient `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, une vidéo réelle du scénario `@SPEC-507`, captures desktop/mobile, comparaisons visuelles applicables et `acceptance.md` reliant chaque CA au test et à sa sortie. Aucune capture ou réussite n’est déclarée sans fichier effectivement généré.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 est remplie : lint, typecheck, build, tests unitaires et d’intégration filtrés, e2e avec vidéo, au moins un test `@visual`, axe, preuves et absence de régression. Le fournisseur simulé couvre le succès et les erreurs ; aucune clé ou donnée privée n’apparaît dans les preuves et aucun appel réel n’a lieu en CI.

## 15. Décisions et hypothèses

Décisions appliquées : ADR-0012, ADR-0073, **ADR-0294**. ADR-0294 consigne la réservation
transactionnelle du plafond (`ai_budget_reservations`, verrou consultatif par apprenant, bail de
15 minutes, rejeu idempotent), le bail Haiku explicite au plafond, la ligne `capped` et la
notification de report dédupliquée par jour local, ainsi que le calcul du coût par défaut dans
`@learny/llm`. Les valeurs normatives viennent des règles métier et de la maquette ; aucune valeur
produit n’est introduite hors du catalogue. Toute ambiguïté d'implémentation découverte ensuite
suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification de la
spécification.
