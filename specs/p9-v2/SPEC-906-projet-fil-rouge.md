---
id: SPEC-906
title: Projet fil rouge
phase: P9
priority: V2
depends_on: [SPEC-613, SPEC-407]
business_rules: [BR-PRA-07]
screens: []
adrs: [ADR-0211]
visual: tokens
---

# SPEC-906 — Projet fil rouge

## 1. Objectif

Accompagner une formation orientée projet par des étapes réparties entre ses modules, des livrables versionnés et évalués, puis une évaluation finale visible dans le bilan. Planifier les étapes sans modifier les règles de déblocage des modules ou les dates FSRS.

## 2. Contexte

Lire BR-PRA-07, BR-PRA-01, BR-FOR-03/14/15 dans `docs/product/business-rules.md`, `docs/product/vision.md` §2–§5, `docs/architecture/data-model.md` §2, §4 et §7, SPEC-407 (planificateur), SPEC-613 (productions et correction), SPEC-617 (bilan), SPEC-605 (objectifs) et ADR-0211. La V1 accepte un objectif `project` mais ne livre pas de projet fil rouge avant P9 (ADR-0074). Le projet reste personnel dans une formation à plusieurs : chaque membre soumet et reçoit une correction propre.

## 3. Dépendances

- **SPEC-613** : schémas de production texte/fichier/lien, barème sur 10, correction par critère et historique de tentative.
- **SPEC-407** : créneaux compatibles, pause/reprise et replanification incrémentale.
- **SPEC-605/617** : objectif projet, programme validé et bilan final.
- **SPEC-206/114** : fichiers privés et URL signées pour un livrable ; les tests utilisent le stockage local et l'IA mock.

## 4. Règles métier couvertes

- **BR-PRA-07** : le projet fil rouge forme une suite de consignes sur la durée de la formation, avec livrables évalués et une évaluation finale. Chaque étape garde son lien au module et la synthèse est rendue dans le bilan.

## 5. Exigences fonctionnelles

- **EF-1** — Pour une formation dont les objectifs comprennent `project`, le tuteur propose un projet avec titre, résultat final attendu, critères de réussite et une étape par module au plus, plus l'étape finale après le dernier module. L'apprenant voit la proposition et valide le projet avant planification ; aucune étape n'est créée automatiquement pour une formation sans cet objectif.
- **EF-2** — Chaque étape présente consigne, notions à mobiliser, livrable accepté (`text`, `file` ou `url`), date prévue et critères de retour. La consigne est liée à la version du programme utilisée ; un module déplacé replanifie l'étape future sans changer une étape déjà soumise.
- **EF-3** — L'apprenant peut enregistrer un brouillon, déposer un livrable, le remplacer par une nouvelle version et soumettre. Une soumission verrouille sa version pour la correction, tout en permettant une révision ultérieure explicitement nommée ; les versions précédentes et leur retour restent consultables.
- **EF-4** — Le tuteur corrige par critère avec un score borné sur 10, une justification et une prochaine action. Une sortie non conforme est renvoyée au tuteur au plus deux fois puis marque la correction en échec, sans inventer de note ; « Réessayer la correction » conserve le livrable soumis.
- **EF-5** — La planification place les étapes dans les moments d'étude disponibles, après le cours du module et avant la date de fin si possible. Une pause gèle les créneaux futurs ; reprise ou changement de rythme replanifie seulement les étapes non soumises. Un conflit de capacité produit les options habituelles de SPEC-407/705 et requiert le choix de l'apprenant.
- **EF-6** — L'étape finale reçoit son propre livrable et une note sur 10 avec synthèse des étapes précédentes. Elle figure dans le bilan final avec versions, points forts, points à reprendre et lien vers chaque étape. Les notes intermédiaires et finale ne modifient pas rétroactivement les quiz de validation ni FSRS (ADR-0211).
- **EF-7** — Dans une formation de groupe, le projet peut partager la description d'étape du programme, mais les brouillons, fichiers, notes, corrections et états de soumission sont privés à chaque membre. Le propriétaire ne voit pas les livrables d'un autre sans partage explicite prévu par une autre spécification.

## 6. Exigences techniques

- **ET-1** — Définir `projects`, `project_steps`, `project_deliverables`, `project_feedback` avec `formation_id`, `owner_id` sur les données personnelles, `module_id` facultatif pour l'étape finale, `programme_version`, `step_order`, `status`, `version`, timestamps. Contraintes : au plus une étape active par module/propriétaire, une étape finale, ordre stable et correction liée à la version du livrable.
- **ET-2** — Les schémas Zod `ProjectProposal`, `ProjectStep`, `DeliverableInput`, `ProjectFeedback` valident appartenance des modules/notions, types de livrable, barème (poids entiers total 10) et absence de lien arbitraire non HTTP(S). Le code valide chaque sortie du modèle avant toute écriture.
- **ET-3** — Routes `/api/v1/formations/:fid/project` (GET/POST validation), `/project/steps/:id` (GET), `/project/steps/:id/drafts` (PUT), `/project/steps/:id/submit` (POST), `/project/steps/:id/feedback` (GET) ; `problem+json`, `Idempotency-Key` sur soumission, ajout à `docs/architecture/api.md`.
- **ET-4** — Le service applique des transactions pour création d'étapes, nouvelle version et correction. Le job de correction est idempotent sur `(stepId, deliverableVersion)` ; le fichier reste en Storage privé et seules des URL signées brèves sont retournées après RLS.
- **ET-5** — Les fonctions pures de placement reçoivent jours, heures, modules et pause en entrée ; elles utilisent le planificateur SPEC-407 plutôt qu'une date calculée par le modèle. Les événements `project/step-submitted` et `project/feedback-ready` sont typés dans `packages/jobs` pour notifications existantes.
- **ET-6** — Le bilan de SPEC-617 ajoute la section projet sans changer les critères de `formation/completed`. Les Server Components lisent via services RLS ; les composants interactifs utilisent `@learny/ui` et `apps/web/messages/fr.ts`.

## 7. Comportements attendus et cas limites

- **CL-1** — Formation sans objectif projet : aucun projet automatique ; l'UI ne montre pas de fausse étape.
- **CL-2** — Programme modifié après une soumission : celle-ci reste liée à la version jouée ; seules les étapes futures sont réplanifiées.
- **CL-3** — Double clic Soumettre : une seule version soumise et un seul job de correction.
- **CL-4** — Correction invalide/IA indisponible : statut en attente/échec, livrable intact, score absent.
- **CL-5** — Pause ou date intenable : pas de créneau dans la pause ; options de réajustement avant toute modification.
- **CL-6** — Fichier supprimé : ancienne correction reste traçable mais lien de fichier devient « source supprimée ».
- **CL-7** — Membre de groupe B connaît l'ID d'un livrable A : lecture et URL signée refusées.

## 8. Instructions d'implémentation

1. Créer les tables, RLS, schémas et migration ; tester groupe, versions et barème. Commit `feat(SPEC-906): définit le projet et ses livrables`.
2. Écrire proposition/validation, placement et replanification en réutilisant SPEC-407 ; tests de pause et capacité. Commit `feat(SPEC-906): planifie les étapes du projet`.
3. Implémenter brouillon, soumission versionnée, correction et reprise mock ; brancher le bilan. Commit `feat(SPEC-906): corrige les livrables et produit le bilan`.
4. Ajouter écrans, e2e filmé, contrôle visuel et non-régression ; exécuter la validation et relier les CA aux rapports réels.

## 9. Fichiers et composants concernés

- **Créés** : `packages/db/src/schema/projects.ts`, migrations `packages/db/migrations/<n>_projects.sql` et copie Supabase, `packages/contracts/src/projects.ts`, `packages/services/src/projects/propose.ts`, `packages/services/src/projects/schedule.ts`, `packages/services/src/projects/submit.ts`, `packages/services/src/projects/grade.ts`, `packages/services/src/projects/schedule.test.ts`, `packages/services/test/integration/projects.test.ts`, `packages/tutor/prompts/project-feedback.md`, `packages/llm/fixtures/tutor/project-*.json`, `apps/web/app/(app)/formations/[fid]/projet/page.tsx`, `apps/web/components/projects/`, `apps/web/e2e/specs/p9/spec-906.spec.ts`.
- **Modifiés** : agenda SPEC-704/705, bilan SPEC-617, `packages/jobs/src/events.ts`, `docs/architecture/api.md`, `docs/architecture/data-model.md`, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : formulaire de production SPEC-613, planificateur SPEC-407, Storage SPEC-114/206, `userDb(ctx)`.

## 10. Interface et conformité visuelle

Mode `tokens`, sans maquette propre. La page Projet reprend sur-titre/titre et cartes de `docs/product/screens.md` §3 : carte de synthèse (objectif final, avancement), liste ordonnée des étapes avec module/date/statut, panneau d'étape avec consigne, dépôt de livrable et retour. La section du bilan reprend une carte statistique et les points forts/à reprendre. `data-testid` : `project-summary`, `project-steps`, `project-deliverable`, `project-feedback`, `project-final`.

À 390 px, la liste précède le détail sans colonne hors écran ; les états brouillon, soumis, correction en cours/échec et corrigé sont lisibles en texte et `aria-live`. `expectTokens`, structure, axe et `toHaveScreenshot('projet-fil-rouge.png', { maxDiffPixelRatio: 0.01 })` en desktop/mobile ; aucune référence de maquette inexistante n'est inventée.

## 11. Critères d'acceptation

- **CA-1** — Une formation projet propose une suite d'étapes liée aux modules et une étape finale ; une formation sans cet objectif n'en crée aucune automatiquement.
- **CA-2** — Brouillon, soumission, remplacement et correction conservent les versions et notes sur 10 sans doublon de job.
- **CA-3** — Pause/reprise replanifie les étapes futures dans les créneaux compatibles sans déplacer un livrable déjà soumis.
- **CA-4** — Le bilan affiche l'évaluation finale sans modifier les quiz/FSRS ; les livrables de deux membres restent isolés.
- **CA-5** — Page projet et bilan passent axe, jetons, structure, captures desktop/mobile et une vidéo e2e.

## 12. Plan de tests

- **Unitaires** — `schedule.test.ts`, `describe('[SPEC-906] project steps')` : objectif, ordre, planification, pause, barème/versions (CA-1–CA-3).
- **Intégration** — `projects.test.ts`, `describe('[SPEC-906] project lifecycle')` : proposition mock, validation, soumission double, correction invalide, bilan, RLS entre membres et absence de mutation FSRS (CA-1–CA-4).
- **End-to-end** — `apps/web/e2e/specs/p9/spec-906.spec.ts`, `test('réalise un projet fil rouge @SPEC-906')` : valider projet, déposer deux étapes, mettre la formation en pause/reprise, rendre le final et ouvrir le bilan ; vidéo (CA-2–CA-5).
- **Visuel** — `test('projet fil rouge conforme @SPEC-906 @visual')` : jetons, structure, axe, captures desktop/mobile ≤ 1 % (CA-5).
- **Non-régression** — SPEC-407, 613, 617, 704/705 et sécurité SPEC-805.

| Critère | Tests |
|---|---|
| CA-1 | unitaires objectif ; intégration proposition |
| CA-2 | intégration versions/correction ; e2e |
| CA-3 | unitaires placement ; intégration pause ; e2e |
| CA-4 | intégration bilan/RLS |
| CA-5 | e2e `@SPEC-906 @visual` |

## 13. Preuves attendues

`evidence/SPEC-906/` contient rapports, trace anonymisée des versions/notes, créneaux avant/après pause, preuve RLS et de l'absence de mutation FSRS, vidéo/captures projet+bilan, `checks.json`, `acceptance.md`. Les retours IA proviennent de fixtures mock identifiées dans les rapports.

## 14. Définition de terminé

La définition de `docs/engineering/testing.md` §7 est satisfaite. Étapes et livrables sont versionnés, les notes sont bornées, la planification respecte les pauses, et les données personnelles restent privées dans les groupes.

## 15. Décisions et hypothèses

ADR-0211 fixe l'étape par module, l'étape finale et leur effet sur le bilan ; ADR-0021 garde la correction sous contrôle du code. Le projet n'est pas requis pour valider les modules V1, afin de préserver les parcours existants. La fonction est livrée seulement en V2 selon ADR-0074.
