---
id: SPEC-411
title: "Services de persistance du moteur"
phase: P4
priority: V1
depends_on: [SPEC-402, SPEC-403, SPEC-404, SPEC-405, SPEC-406, SPEC-407, SPEC-408, SPEC-409, SPEC-410, SPEC-107, SPEC-108]
business_rules: [BR-LAC-02]
screens: []
adrs: [ADR-0020]
visual: demo
---

# SPEC-411 — Services de persistance du moteur

## 1. Objectif

packages/services/learning : application transactionnelle des résultats (réponses → review_logs, notion_states, maîtrise, lacunes, gap_events, événements gap/detected|cleared, daily_activity), lecture des notions dues, planification persistée (schedule_slots). La livraison est vérifiable par les contrats, les états d’interface et les critères de la section 11.

## 2. Contexte

Lire `docs/architecture/overview.md` §4–§5, `docs/architecture/data-model.md` §5–§7, `docs/engineering/conventions.md` §7, `docs/engineering/testing.md` et les fonctions pures de SPEC-402 à 410. SPEC-107/108 fournissent les tables et SPEC-203 les événements. Ce service orchestre la transaction et garde les algorithmes dans `@learny/learning-engine`.

## 3. Dépendances

- **SPEC-402** — Répétition espacée FSRS par notion.
- **SPEC-403** — Calcul de la maîtrise.
- **SPEC-404** — Détection, nature et levée des lacunes.
- **SPEC-405** — Tirage des questions d'une tentative.
- **SPEC-406** — Tirage de la session de quiz global.
- **SPEC-407** — Planificateur.
- **SPEC-408** — Rétention et indicateurs de progression.
- **SPEC-409** — Série et jalons.
- **SPEC-410** — Sélection de l'échauffement.
- **SPEC-107** — tables notion_states, review_logs et gap_events.
- **SPEC-108** — tables schedule_slots et daily_activity.
- La base locale, RLS et les jobs simulés sont nécessaires aux tests d’intégration. Le service prend une horloge injectable et n’appelle aucun fournisseur IA.

## 4. Règles métier couvertes

- **BR-LAC-02** — Une notion devient une lacune si sa maîtrise reste sous le seuil après une tentative de quiz de validation, d'examen ou d'exercice, ou si la même erreur (même distracteur ou même réponse fausse normalisée) revient lors de deux tentatives.

## 5. Exigences fonctionnelles

- **EF-1** — Appliquer dans une seule transaction les réponses corrigées d’une tentative à `review_logs`, `notion_states`, maîtrise, lacunes, `gap_events` et `daily_activity` ; une tentative rejouée ne crée pas de seconde application.
- **EF-2** — Après chaque réponse, appeler les fonctions pures FSRS, maîtrise et lacunes ; émettre `gap/detected`, `gap/nature-changed` ou `gap/cleared` seulement après commit, avec identifiants et preuve typés.
- **EF-3** — Lire les notions dues d’une formation par utilisateur, date et statut de module, puis composer SPEC-406 pour la session du jour sans exposer les notions d’un autre membre.
- **EF-4** — Persister les créneaux produits par SPEC-407 par diff idempotent : conserver terminés et déplacements manuels, créer/modifier seulement les futurs créneaux calculés.
- **EF-5** — Mettre à jour les indicateurs de rétention et série à partir des données persistées, sans recalculer une autre interprétation métier des algorithmes du moteur.

## 6. Exigences techniques

- **ET-1** — `applyLearningResult(ctx, attemptId)` vérifie propriété et statut `graded`, verrouille la tentative/état de notion, lit les réponses et appelle le moteur dans une transaction utilisateur RLS.
- **ET-2** — `getDueNotions(ctx, formationId, at)` joint `notion_states`, `module_progress` et `formations`, filtre `due_at <= at` et `in_review=true`, puis retourne un DTO sans champ privé inutile.
- **ET-3** — `persistPlan(ctx, formationId, plan, revisionKey)` fait un upsert idempotent des `schedule_slots` futurs ; l’émission d’événements passe par l’outbox/événements de SPEC-203 après commit.
- **ET-4** — Toutes les écritures d’une tentative s’exécutent dans une transaction `userDb(ctx)` avec verrou de ligne/idempotence ; `serviceDb()` est réservé aux jobs autorisés. Les événements sont émis après commit via la garantie de SPEC-203.
- **ET-5** — Les DTO sont validés par `packages/contracts`, les erreurs par `AppError`, les dates par `clock.now()` ; aucune lecture directe d’un état appartenant à un autre utilisateur.

## 7. Comportements attendus et cas limites

- **CL-1** — Deux soumissions simultanées du même attemptId : une seule mise à jour de FSRS et des journaux.
- **CL-2** — Erreur d’écriture en milieu de transaction : aucun journal ni état partiel.
- **CL-3** — Notion ou formation d’un autre utilisateur : refus RLS, aucune existence révélée.
- **CL-4** — Émission Inngest temporairement indisponible : transaction persistée et événement repris par mécanisme fiable, pas perdu.
- **CL-5** — Réponse non corrigée : ne pas inventer une note FSRS ; attente de correction.

## 8. Instructions d'implémentation

1. Définir les contrats d’orchestration et tests de transaction sur base locale ; relire les exports de SPEC-402 à 410.
2. Implémenter `applyLearningResult` avec verrou, lecture des réponses corrigées, calcul pur et écritures atomiques. Commit `feat(SPEC-411): applique les résultats dans une transaction`.
3. Implémenter lecture des notions dues et persistance idempotente du plan ; brancher les événements après commit. Commit `feat(SPEC-411): persiste le plan et les lacunes`.
4. Écrire tests RLS, concurrence, rollback, e2e filmé et démonstration SDD. Commit `test(SPEC-411): vérifie l’orchestration du moteur`.
5. Valider et renseigner `acceptance.md` avec les sorties réelles avant `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/services/src/learning/apply-result.ts`, `packages/services/src/learning/get-due-notions.ts`, `packages/services/src/learning/persist-plan.ts`, `packages/services/src/learning/index.ts`, `packages/services/test/integration/apply-result.test.ts`, `apps/web/components/sdd-demos/spec-411.tsx`, `apps/web/e2e/specs/p4/spec-411.spec.ts`, `packages/services/src/learning/apply-result.test.ts`.
- **Modifiés** : `packages/services/src/index.ts`, `packages/jobs/src/events.ts` si le type d’événement manque, registre de démonstration SDD.
- **Lus / réutilisés** : `@learny/core`, `@learny/testing`, `ts-fsrs` pour SPEC-402, sorties des dépendances ; dépendances SPEC-402, SPEC-403, SPEC-404, SPEC-405, SPEC-406, SPEC-407, SPEC-408, SPEC-409, SPEC-410, SPEC-107, SPEC-108.

## 10. Interface et conformité visuelle

Mode `demo`. Page SDD : tentative fictive, états avant/après pour deux notions, journal des événements et créneaux du plan ; le scénario simulé s’exécute sur des données de test isolées et montre explicitement la transaction. Mode `demo` : la page `/_dev/sdd/SPEC-411` montre une tentative fictive, les états avant/après et les événements réellement écrits dans une base de test isolée. Vérifier jetons, structure, axe et capture de non-régression desktop/mobile à 1 %.

## 11. Critères d'acceptation

- **CA-1** — Une tentative corrigée de deux notions crée deux `review_logs`, met à jour leurs états et `daily_activity` en une transaction ; un deuxième appel ne change aucun compte.
- **CA-2** — Une lacune détectée ou levée crée exactement un `gap_event` et un événement de domaine après commit.
- **CA-3** — Une erreur forcée au milieu de l’application laisse les tables identiques à l’état initial.
- **CA-4** — Deux utilisateurs d’une même formation partagée ne lisent ni n’écrivent les états de notion et résultats de l’autre ; les créneaux manuels/terminés survivent à la replanification.
- **CA-5** — La démonstration affiche le résumé transactionnel réel du mode test, avec vidéo, axe et `@visual`.

## 12. Plan de tests

- **Unitaires** — `describe('[SPEC-411] orchestration')` dans `packages/services/src/learning/apply-result.test.ts` : double application, ordre des calculs et état non corrigé (CA-1, CA-2).
- **Intégration** — `packages/services/test/integration/apply-result.test.ts`, `describe('[SPEC-411] transaction RLS')` : rollback, deux utilisateurs, concurrence, événements après commit et créneaux conservés (CA-1 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p4/spec-411.spec.ts`, `test('applique un résultat @SPEC-411')` : lancer la démonstration, lire le résumé et conserver la vidéo (CA-5).
- **Visuel** — `test('résultat du moteur @SPEC-411 @visual')` : jetons, structure, axe, desktop/mobile ≤ 1 % (CA-5).
- **Non-régression** — rejouer les étiquettes `[SPEC-402]` / `@SPEC-402`, `[SPEC-403]` / `@SPEC-403`, `[SPEC-404]` / `@SPEC-404`, `[SPEC-405]` / `@SPEC-405`, `[SPEC-406]` / `@SPEC-406`, `[SPEC-407]` / `@SPEC-407`, `[SPEC-408]` / `@SPEC-408`, `[SPEC-409]` / `@SPEC-409`, `[SPEC-410]` / `@SPEC-410`, `[SPEC-107]` / `@SPEC-107`, `[SPEC-108]` / `@SPEC-108`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; intégration |
| CA-2 | unitaires ; intégration |
| CA-3 | intégration rollback |
| CA-4 | intégration RLS et plan |
| CA-5 | e2e ; @visual |

## 13. Preuves attendues

`evidence/SPEC-411/` contient `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, une vidéo réelle du scénario `@SPEC-411`, captures desktop/mobile, comparaisons visuelles applicables et `acceptance.md` reliant chaque CA au test et à sa sortie. Aucune capture ou réussite n’est déclarée sans fichier effectivement généré.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 est remplie : lint, typecheck, build, tests unitaires et d’intégration filtrés, e2e avec vidéo, au moins un test `@visual`, axe, preuves et absence de régression. Les services appliquent les fonctions pures dans des transactions idempotentes sous RLS ; les tests prouvent le rollback, l’isolation de deux utilisateurs et l’émission d’événements après commit.

## 15. Décisions et hypothèses

Décisions appliquées : ADR-0020. Les valeurs normatives viennent des règles métier et de la maquette ; aucune valeur produit n’est introduite hors du catalogue. Toute ambiguïté d’implémentation découverte ensuite suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification de la spécification.
