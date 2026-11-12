---
id: SPEC-407
title: "Planificateur"
phase: P4
priority: V1
depends_on: [SPEC-401]
business_rules: [BR-AGE-03, BR-FOR-14]
screens: []
adrs: [ADR-0029, ADR-0016]
visual: demo
---

# SPEC-407 — Planificateur

## 1. Objectif

Planification gloutonne multi-formations, capacité quotidienne, jours et moments d'étude, marges, quiz global quotidien, examens blancs, sprints, replanification incrémentale, séances manquées, gel de pause, détection de date de fin intenable et calcul des trois options. La livraison est vérifiable par les contrats, les états d’interface et les critères de la section 11.

## 2. Contexte

Lire `docs/product/business-rules.md` (BR-AGE-03, BR-FOR-14), `docs/architecture/overview.md` §1 et §3, `docs/architecture/data-model.md` §5–§7, `docs/engineering/conventions.md` §2, §6 et §7, `docs/engineering/testing.md` et SPEC-401. ADR applicables : ADR-0029, ADR-0016. Le moteur calcule sans accès réseau, base, horloge système ou fournisseur IA ; les services de SPEC-411 persisteront ses sorties.

## 3. Dépendances

- **SPEC-401** — types de créneau et paramètres injectables.
- Les algorithmes reçoivent dates, fuseau et paramètres en entrée et renvoient des données typées sans effet de bord. Les services lisent les bornes dans `packages/config/src/product.ts` et les transmettent au moteur ; les démonstrations utilisent l’horloge figée.

## 4. Règles métier couvertes

- **BR-AGE-03** — Planificateur (code, glouton sous contraintes) : place les activités de chaque module dans les jours et moments d'étude, sans dépasser les heures par jour cumulées toutes formations ; réserve au moins une marge de rattrapage par module (1 h, après le quiz de validation) ; place le quiz global quotidien (fin de journée d'étude).
- **BR-FOR-14** — Si un module reste bloqué (quiz non validé après la dernière marge planifiée, ou retard ≥ 3 jours sur le planning), le tuteur propose trois options : décaler la fin, augmenter le volume quotidien, alléger le programme ; l'apprenant choisit ; rien n'est appliqué sans son accord.

## 5. Exigences fonctionnelles

- **EF-1** — Planifier les formations actives par date de fin croissante, puis chaque module dans l’ordre et chaque activité : apports par chapitre, lecture du cours, exercice éventuel, quiz de validation et marge de rattrapage d’une heure après le quiz.
- **EF-2** — Placer chaque activité dans le premier créneau libre compatible avec les jours d’étude, moments préférés et capacité horaire quotidienne cumulée de toutes les formations ; les créneaux restent dans le fuseau utilisateur.
- **EF-3** — Réserver un quiz global de 30 minutes à la fin de chaque journée d’étude et placer examens blancs et sprints selon leurs contraintes sans déplacer une activité déjà terminée.
- **EF-4** — Replanifier de façon incrémentale après module validé, séance manquée, pause ou changement de rythme ; une formation en pause ne reçoit aucun créneau futur.
- **EF-5** — Si la date de fin ne tient plus, calculer trois options chiffrées : décaler la fin, augmenter le volume quotidien dans la borne 1–6 h, ou alléger le programme ; aucune option n’est appliquée sans accord de l’apprenant.

## 6. Exigences techniques

- **ET-1** — `planSchedule({ formations, preferences, existingSlots, now })` retourne des créneaux triés, les conflits, la capacité restante et les options de réajustement ; l’horloge et le fuseau sont des entrées.
- **ET-2** — `findCompatibleSlots(activity, calendar, preferences, count=3)` retourne les premiers créneaux compatibles, sans chevauchement ni dépassement de capacité.
- **ET-3** — La replanification préserve les créneaux `done` et les déplacements manuels valides ; elle remplace seulement les créneaux futurs calculés, avec identifiants stables pour les éléments inchangés.
- **ET-4** — La fonction du moteur prend un objet d’entrée explicite et retourne un résultat déterministe ; aucune lecture SQL, `fetch`, SDK IA, `Date.now()` ou `new Date()` sans argument n’est autorisée dans `packages/learning-engine`.
- **ET-5** — Exposer les types et fonctions par l’API publique du paquet ; valider les bornes à la frontière du service. Les calculs de temps prennent le fuseau, l’instant et les paramètres configurés comme entrées, puis couvrent les changements d’heure et les ordres d’entrée différents.

## 7. Comportements attendus et cas limites

- **CL-1** — Aucun jour d’étude : entrée refusée par la validation de préférence.
- **CL-2** — Changement d’heure locale : durée réelle correcte et aucun créneau dans une heure inexistante.
- **CL-3** — Deux formations avec la même fin : ordre stable par identifiant.
- **CL-4** — Capacité insuffisante même à 6 h/jour : option volume indisponible, autres options conservées.
- **CL-5** — Séance manquée : créneau historique maintenu `missed`, nouveau créneau futur distinct.

## 8. Instructions d'implémentation

1. Écrire les types d’entrée/sortie et la fonction pure dans `packages/learning-engine/src/planner/plan.ts`, avec paramètres métier fournis par l’appelant et ordre stable des collections. Commit `feat(SPEC-407): ajoute le calcul déterministe`.
2. Couvrir tous les cas limites de la section 7 par des tests unitaires, y compris exemples chiffrés, propriétés de bornes et répétabilité. Commit `test(SPEC-407): vérifie les invariants du moteur`.
3. Brancher l’API publique du paquet et la page `/_dev/sdd/SPEC-407` ; elle montre les entrées et sorties réellement calculées, sans écriture en base.
4. Ajouter test d’intégration de la composition avec les fonctions déjà livrées, e2e filmé et test visuel de la démonstration.
5. Exécuter `validate.mjs SPEC-407`, consigner les preuves réelles puis `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/learning-engine/src/planner/plan.ts`, `packages/learning-engine/src/planner/find-compatible-slots.ts`, `packages/learning-engine/src/planner/replan.ts`, `packages/learning-engine/src/planner/plan.test.ts`, `packages/learning-engine/test/integration/planner.test.ts`, `apps/web/components/sdd-demos/spec-407.tsx`, `apps/web/e2e/specs/p4/spec-407.spec.ts`.
- **Modifiés** : `packages/learning-engine/src/index.ts`, `packages/config/src/product.ts` seulement si une constante normative manque, registre de démonstration SDD.
- **Lus / réutilisés** : `@learny/core`, `@learny/testing`, `ts-fsrs` pour SPEC-402, sorties des dépendances ; dépendances SPEC-401.

## 10. Interface et conformité visuelle

Mode `demo`. Page SDD : grille de jours, deux formations de démonstration, créneaux colorés, capacité et marge ; action simulée « Séance manquée » recalcule le plan et montre les trois options si l’échéance devient intenable. Page `/_dev/sdd/SPEC-407` : afficher les données d’entrée, chaque étape utile et le résultat réellement calculé par le moteur, avec un cas limite visible. Mode `demo` : vérifier jetons, ordre des régions, axe, capture desktop/mobile et `toHaveScreenshot` à 1 %. Aucune maquette métier ne s’applique.

## 11. Critères d'acceptation

- **CA-1** — Deux formations ne dépassent jamais ensemble les heures quotidiennes autorisées et aucune activité ne se chevauche.
- **CA-2** — Chaque module obtient une marge de 60 minutes après le quiz et chaque journée d’étude un quiz global de 30 minutes en fin de journée.
- **CA-3** — Une replanification après pause ou séance manquée conserve les créneaux terminés et respecte le nouveau rythme.
- **CA-4** — Une échéance impossible produit les trois options chiffrées ou marque l’option non réalisable, sans modifier le plan avant consentement.
- **CA-5** — La démonstration affiche le calendrier et les conflits, avec vidéo, axe et test `@visual`.

## 12. Plan de tests

- **Unitaires** — `packages/learning-engine/src/planner/plan.test.ts`, `describe('[SPEC-407] Planificateur')` : capacité, ordre, marges et changement d’heure, cas limites et propriétés de la section 7 (CA-1 à CA-4).
- **Intégration** — `packages/learning-engine/test/integration/planner.test.ts`, `describe('[SPEC-407] composition')` : replanification avec créneaux historiques, entrée/sortie avec les dépendances et invariance à la répétition (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p4/spec-407.spec.ts`, `test('Planificateur @SPEC-407')` : séance manquée et affichage des options dans la démonstration ; conserver vidéo et capture (CA-1, CA-5).
- **Visuel** — `test('Planificateur @SPEC-407 @visual')` : jetons, structure, axe, capture desktop/mobile à 1 % (CA-5).
- **Non-régression** — rejouer les étiquettes `[SPEC-401]` / `@SPEC-401`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; e2e |
| CA-2 | unitaires ; intégration |
| CA-3 | unitaires ; intégration |
| CA-4 | unitaires ; intégration |
| CA-5 | e2e ; @visual |

## 13. Preuves attendues

`evidence/SPEC-407/` contient `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, une vidéo réelle du scénario `@SPEC-407`, captures desktop/mobile, comparaisons visuelles applicables et `acceptance.md` reliant chaque CA au test et à sa sortie. Aucune capture ou réussite n’est déclarée sans fichier effectivement généré.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 est remplie : lint, typecheck, build, tests unitaires et d’intégration filtrés, e2e avec vidéo, au moins un test `@visual`, axe, preuves et absence de régression. La fonction pure reste déterministe à entrée identique, sans I/O, base, IA ni import de `packages/config` ; les services lui transmettent les paramètres métier.

## 15. Décisions et hypothèses

Décisions appliquées : ADR-0029, ADR-0016, ADR-0280. Les valeurs normatives viennent des règles métier et de la maquette ; aucune valeur produit n’est introduite hors du catalogue. ADR-0280 fixe la dérivation des durées depuis le volume du module, la réservation du quiz global quotidien, les identifiants stables et la simulation des trois options. Toute ambiguïté d’implémentation découverte ensuite suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification de la spécification.
