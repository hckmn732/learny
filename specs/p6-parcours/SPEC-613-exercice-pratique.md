---
id: SPEC-613
title: "Exercice pratique"
phase: P6
priority: V1
depends_on: [SPEC-503, SPEC-508, SPEC-404]
business_rules: [BR-PRA-01, BR-LAC-04]
screens: [SCR-08]
adrs: [ADR-0027, ADR-0308]
visual: mockup
---

# SPEC-613 — Exercice pratique

## 1. Objectif

Écran Exercice.dc.html générique : consigne, données, production (tableau avec contrôle en direct, texte, fichier, lien), explication écrite, 2 indices, soumission, correction du tuteur par critère, maîtrise avant/après, étape suivante ; génération des exercices par le tuteur. Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-08 : `/formations/[fid]/modules/[mid]/exercices/[aid]`. Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-503** — Rendu des briques ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-508** — Paquet tutor : actions, boucle et consignes ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-404** — Détection, nature et levée des lacunes ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les services applicatifs utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201, le client utilisateur soumis à RLS de SPEC-113 et les événements de SPEC-203. Les composants interactifs réutilisent `@learny/ui` et les textes passent par `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-PRA-01** — Exercice pratique (brique consigne) : consigne, données, production attendue de type texte, fichier, lien ou **tableau structuré** (colonnes typées définies par le tuteur, contrôles automatiques facultatifs comme « somme débit = somme crédit »), barème sur 10 réparti par critères, 2 indices maximum (chacun retire 1 point), correction du tuteur par critère avec explication, mise à jour de la maîtrise, prochaine étape proposée.
- **BR-LAC-04** — Réponse du tuteur selon la nature : oubli → révision dans le quiz global ; confusion → question qui oppose les deux notions et comparaison côte à côte ; incompréhension → nouvelle explication sous un autre angle ; difficulté d'application → exercice pratique.

## 5. Exigences fonctionnelles

- **EF-1** — Un exercice présente consigne, données, production attendue `text|file|link|structured_table`, explication écrite et au plus deux indices. Le tableau structuré valide ses colonnes typées et contrôles déclarés avant soumission.
- **EF-2** — La correction porte un barème total de 10 points réparti par critères ; chaque indice utilisé retire 1 point du score maximal. Le tuteur rend une note par critère avec explication et les maîtrises avant/après.
- **EF-3** — Après soumission, afficher la prochaine étape ; une difficulté d’application détectée par SPEC-404 oriente vers cet exercice et sa correction met à jour la maîtrise par SPEC-411.
- **EF-4** — Les règles métier BR-PRA-01, BR-LAC-04 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Chaque lecture et mutation utilise le client de l’utilisateur soumis à RLS ; un autre utilisateur reçoit 404. Les entrées/sorties passent par les schémas Zod de `packages/contracts`, et les routes renvoient `application/problem+json` en erreur.
- **ET-2** — Les écritures multi-tables sont transactionnelles ; un événement est émis après commit et une clé d’idempotence empêche une double transition. Les dates passent par l’horloge injectable et le fuseau IANA du profil.
- **ET-3** — `ExerciseInstructionSchema` vérifie production attendue et critères dont la somme des points vaut 10 ; `SubmissionSchema` discrimine texte, fichier signé, lien et tableau. Les contrôles automatiques de tableau sont des règles codées, jamais du JavaScript fourni par le modèle.
- **ET-4** — Service `ensurePracticeExercise(ctx, notionId)` réutilisable par SPEC-716 ; la création est idempotente par notion et version du cours. `gradeExercise` valide les sous-scores bornés et applique la pénalité d’indices avant persistance.
- **ET-5** — Routes de tentative et `/modules/:mid/exercises/:aid/hint` vérifient propriété, état, idempotence et nombre d’indices. La correction IA utilise une fixture `LLM_MODE=mock` et ne reçoit que les données nécessaires.

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Troisième demande d’indice : 422, score maximal inchangé après les deux premiers retraits.
- **CL-4** — Tableau dont une cellule ne respecte pas le type : erreur sur la cellule et soumission bloquée ; aucun appel IA.
- **CL-5** — Correction du modèle dépassant le barème : rejet puis correction automatique limitée, sans note affichée avant validation.

## 8. Instructions d'implémentation

1. Définir brique consigne, production discriminée et critères dont la somme vaut 10. Commit `feat(SPEC-613): définit les contrats`.
2. Implémenter validations automatiques du tableau et `ensurePracticeExercise`, puis indices plafonnés à deux avec pénalité. Commit `feat(SPEC-613): implémente les services`.
3. Implémenter soumission et correction par critère via tuteur mock, bornage des scores et mise à jour de maîtrise. Commit `feat(SPEC-613): construit le parcours`.
4. Composer l’exercice générique et l’état résultat de la maquette, avec focus et erreurs de cellule. Commit `test(SPEC-613): vérifie les cas`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-613`, renseigner les preuves réellement produites puis `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/exercises.ts`, `packages/services/src/exercises/{ensure-practice-exercise,validate-production,grade-exercise}.ts`, `packages/services/test/integration/practice-exercise.test.ts`, `apps/web/app/(app)/formations/[fid]/modules/[mid]/exercices/[aid]/page.tsx`, `apps/web/components/exercises/{StructuredTable,HintButton,CriteriaFeedback}.tsx`, `apps/web/e2e/specs/p6/practice-exercise.spec.ts`.
- **Modifiés** : `packages/bricks/src/registry.ts`, `packages/services/src/learning/index.ts`, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `specs/p5-ia/SPEC-503-rendu-des-briques.md`, `specs/p5-ia/SPEC-508-paquet-tutor-actions-boucle-et-consignes.md`, `specs/p4-moteur/SPEC-404-detection-nature-et-levee-des-lacunes.md`.

## 10. Interface et conformité visuelle

`Exercice.dc.html` : consigne et données, zone de production avec tableau, bloc « Expliquez votre démarche », deux boutons d’indice, soumission, correction par critère et étape suivante. `data-testid` : `exercise-table`, `exercise-hint`, `exercise-submit`, `exercise-feedback`.

- **Contrôles** — Utiliser la référence du SCR-08 dans `design/references/` et mesurer ≤ 12 % de pixels différents ; vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — Le tableau démo refuse un débit/crédit déséquilibré et accepte le tableau équilibré, avant tout appel IA.
- **CA-2** — Deux indices réduisent le score maximal de 10 à 8 ; un troisième est refusé ; la correction affiche un sous-score pour chaque critère.
- **CA-3** — Soumettre puis recharger retrouve la production et la correction, ainsi que la maîtrise avant/après.
- **CA-4** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
- **CA-5** — L’écran respecte la maquette avec un écart ≤ 12 % ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

**Unitaires** (2 fichiers, `[SPEC-613]`) :
- `packages/services/src/exercises/validate-production.test.ts` — `[SPEC-613]` : texte/fichier/lien/tableau, types de colonnes et débit=crédit.
- `packages/services/src/exercises/grade-exercise.test.ts` — `[SPEC-613]` : barème total 10, zéro/un/deux indices → maximum 10/9/8, sous-score hors bornes refusé.

**Intégration** (Supabase local, `LLM_MODE=mock`, `[SPEC-613]`) :
- `packages/services/test/integration/practice-exercise.test.ts` — `[SPEC-613]` : création par notion, troisième indice 422, soumission unique, correction mock par critère, review_logs et maîtrise avant/après, 404 RLS.

**End-to-end** (`apps/web/e2e/specs/p6/practice-exercise.spec.ts`, vidéo) :
- **Scénario** — `résout un exercice structuré @SPEC-613` : remplir tableau déséquilibré puis équilibré, demander deux indices, expliquer, soumettre et lire score/maîtrise.
- **Scénario** — `reprend une production @SPEC-613` : recharger avant soumission et retrouver cellules et explication.

**Visuel** — `test('conformité SPEC-613 @SPEC-613 @visual')` : `SCR-08-desktop.png` et mobile : consigne, données, tableau, deux indices, explication et correction ; diff ≤ 12 %, axe, capture ≤ 1 %.

**Non-régression** — Rejouer `[SPEC-503]` et `@SPEC-503`, `[SPEC-508]` et `@SPEC-508`, `[SPEC-404]` et `@SPEC-404` et les suites complètes unitaires/intégration.

| Critère | Tests |
|---|---|
| CA-1 | unitaires et intégration ciblés ; e2e `@SPEC-613` |
| CA-2 | unitaires et intégration ciblés ; e2e `@SPEC-613` |
| CA-3 | unitaires et intégration ciblés ; e2e `@SPEC-613` |
| CA-4 | intégration RLS/idempotence, e2e erreur |
| CA-5 | `@SPEC-613 @visual`, axe, vidéo |

## 13. Preuves attendues

`evidence/SPEC-613/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-5. Conserver la comparaison côte à côte et le diff avec la référence de maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- **ADR-0027 — Exercice pratique : production structurée** : La brique `instruction` accepte `production.kind ∈ {text, file, link, table}`. Pour `table` : colonnes `{key, label, type: text|number|select, options?}`, lignes min/max, et contrôles facultatifs `{type:'sum_equal', numberColumn, groupColumn, left:[valeurs], right:[valeurs]}` évalués en direct par le code. Barème sur 10 par critères ; 2 indices max (−1 point chacun).
- **ADR-0308 — Persistance et correction de l’exercice pratique** : activité `exercise` + brique `instruction` immuable, idempotence par notion et version du cours, brouillon dans la réponse de la tentative en cours, correction `mockTutor` bornée et maîtrise appliquée par SPEC-411 ; aucune migration.
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.

