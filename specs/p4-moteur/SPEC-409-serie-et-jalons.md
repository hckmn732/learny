---
id: SPEC-409
title: "Série et jalons"
phase: P4
priority: V1
depends_on: [SPEC-401]
business_rules: [BR-GAM-01, BR-GAM-03]
screens: []
adrs: [ADR-0033]
visual: demo
---

# SPEC-409 — Série et jalons

## 1. Objectif

Calcul de la série (jours neutres : non prévus, pause), régularité sur 14 jours, détection des jalons (module validé, 100 notions retenues, 30 jours). La livraison est vérifiable par les contrats, les états d’interface et les critères de la section 11.

## 2. Contexte

Lire `docs/product/business-rules.md` (BR-GAM-01, BR-GAM-03), `docs/architecture/overview.md` §1 et §3, `docs/architecture/data-model.md` §5–§7, `docs/engineering/conventions.md` §2, §6 et §7, `docs/engineering/testing.md` et SPEC-401. ADR applicables : ADR-0033. Le moteur calcule sans accès réseau, base, horloge système ou fournisseur IA ; les services de SPEC-411 persisteront ses sorties.

## 3. Dépendances

- **SPEC-401** — types de journée et horloge injectée.
- Les algorithmes reçoivent dates, fuseau et paramètres en entrée et renvoient des données typées sans effet de bord. Les services lisent les bornes dans `packages/config/src/product.ts` et les transmettent au moteur ; les démonstrations utilisent l’horloge figée.

## 4. Règles métier couvertes

- **BR-GAM-01** — Une journée compte pour la série si l'utilisateur a terminé au moins une activité d'étude (session de quiz global, micro-séance, quiz, exercice, examen, lecture ≥ 5 min ou dépôt d'apport) dans son fuseau. La série = jours d'étude consécutifs ; les jours non prévus dans le rythme et les jours de pause ne cassent pas la série.
- **BR-GAM-03** — Jalons sobres : module validé, 100 notions retenues (maîtrise ≥ 80 %), 30 jours de série. Pas de classement ; rien ne récompense la vitesse.

## 5. Exigences fonctionnelles

- **EF-1** — Une journée locale compte pour la série si au moins une activité qualifiante a été terminée : quiz global, micro-séance, quiz, exercice, examen, lecture de cinq minutes ou plus, ou dépôt d’apport.
- **EF-2** — Parcourir les jours en arrière depuis la date locale de référence ; un jour non prévu dans le rythme et un jour de pause sont neutres, un jour prévu sans activité qualifiante casse la série.
- **EF-3** — Produire les 14 cases de régularité des jours locaux les plus récents avec états étudié, neutre ou manqué, indépendamment de la valeur de la série.
- **EF-4** — Détecter les jalons module validé, 100 notions à maîtrise ≥ 80 %, et 30 jours de série ; une même occurrence ne produit qu’un jalon même après recalcul.
- **EF-5** — Ne récompenser ni vitesse ni classement entre apprenants ; les jalons restent sobres et individuels.

## 6. Exigences techniques

- **ET-1** — `calculateStreak({ dailyActivity, studyDays, pauses, at, timeZone })` retourne `days`, `calendar[14]`, `lastQualifyingDay` sans écrire en base.
- **ET-2** — `detectMilestones({ previousKeys, validatedModules, masteredNotions, streakDays })` retourne les clés nouvelles avec référence de module le cas échéant.
- **ET-3** — La conversion de jour emploie les utilitaires de `@learny/core/time`, jamais une date UTC découpée comme jour local. Les entrées sont triées et dédupliquées par date locale.
- **ET-4** — La fonction du moteur prend un objet d’entrée explicite et retourne un résultat déterministe ; aucune lecture SQL, `fetch`, SDK IA, `Date.now()` ou `new Date()` sans argument n’est autorisée dans `packages/learning-engine`.
- **ET-5** — Exposer les types et fonctions par l’API publique du paquet ; valider les bornes à la frontière du service. Les calculs de temps prennent le fuseau, l’instant et les paramètres configurés comme entrées, puis couvrent les changements d’heure et les ordres d’entrée différents.

## 7. Comportements attendus et cas limites

- **CL-1** — Aujourd’hui prévu mais encore en cours : série de la veille conservée jusqu’à la fin du jour, pas cassée prématurément.
- **CL-2** — Week-end non prévu entre deux jours actifs : neutre et série maintenue.
- **CL-3** — Pause couvrant un jour prévu : neutre.
- **CL-4** — Lecture 4 min 59 s : non qualifiante ; 5 min : qualifiante.
- **CL-5** — Recalcul de 100 notions ou 30 jours : aucun doublon de jalon.

## 8. Instructions d'implémentation

1. Écrire les types d’entrée/sortie et la fonction pure dans `packages/learning-engine/src/streak/calculate.ts`, avec paramètres métier fournis par l’appelant et ordre stable des collections. Commit `feat(SPEC-409): ajoute le calcul déterministe`.
2. Couvrir tous les cas limites de la section 7 par des tests unitaires, y compris exemples chiffrés, propriétés de bornes et répétabilité. Commit `test(SPEC-409): vérifie les invariants du moteur`.
3. Brancher l’API publique du paquet et la page `/_dev/sdd/SPEC-409` ; elle montre les entrées et sorties réellement calculées, sans écriture en base.
4. Ajouter test d’intégration de la composition avec les fonctions déjà livrées, e2e filmé et test visuel de la démonstration.
5. Exécuter `validate.mjs SPEC-409`, consigner les preuves réelles puis `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/learning-engine/src/streak/calculate.ts`, `packages/learning-engine/src/streak/milestones.ts`, `packages/learning-engine/src/streak/calculate.test.ts`, `packages/learning-engine/test/integration/streak.test.ts`, `apps/web/components/sdd-demos/spec-409.tsx`, `apps/web/e2e/specs/p4/spec-409.spec.ts`.
- **Modifiés** : `packages/learning-engine/src/index.ts`, `packages/config/src/product.ts` seulement si une constante normative manque, registre de démonstration SDD.
- **Lus / réutilisés** : `@learny/core`, `@learny/testing`, `ts-fsrs` pour SPEC-402, sorties des dépendances ; dépendances SPEC-401.

## 10. Interface et conformité visuelle

Mode `demo`. Page SDD : compteur de série, calendrier de 14 cases avec légende étudié/neutre/manqué et liste de jalons ; action de simulation d’un jour non prévu pour montrer la neutralité. Page `/_dev/sdd/SPEC-409` : afficher les données d’entrée, chaque étape utile et le résultat réellement calculé par le moteur, avec un cas limite visible. Mode `demo` : vérifier jetons, ordre des régions, axe, capture desktop/mobile et `toHaveScreenshot` à 1 %. Aucune maquette métier ne s’applique.

## 11. Critères d'acceptation

- **CA-1** — Vendredi et lundi étudiés avec week-end non prévu donnent une série de deux jours d’étude consécutifs.
- **CA-2** — Un jour prévu sans activité terminée casse la série ; une pause ou un jour non prévu ne la casse pas.
- **CA-3** — Les 14 états de régularité correspondent aux dates locales, y compris à une transition d’heure.
- **CA-4** — Un module validé, 100 notions retenues et 30 jours déclenchent chacun un seul jalon, sans doublon au recalcul.
- **CA-5** — La démonstration affiche série et 14 cases, avec vidéo, axe et test `@visual`.

## 12. Plan de tests

- **Unitaires** — `packages/learning-engine/src/streak/calculate.test.ts`, `describe('[SPEC-409] Série et jalons')` : jours qualifiants, neutres, lecture de cinq minutes, cas limites et propriétés de la section 7 (CA-1 à CA-4).
- **Intégration** — `packages/learning-engine/test/integration/streak.test.ts`, `describe('[SPEC-409] composition')` : composition avec activité quotidienne et jalons, entrée/sortie avec les dépendances et invariance à la répétition (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p4/spec-409.spec.ts`, `test('Série et jalons @SPEC-409')` : calendrier de 14 jours et jalons visibles dans la démonstration ; conserver vidéo et capture (CA-1, CA-5).
- **Visuel** — `test('Série et jalons @SPEC-409 @visual')` : jetons, structure, axe, capture desktop/mobile à 1 % (CA-5).
- **Non-régression** — rejouer les étiquettes `[SPEC-401]` / `@SPEC-401`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; e2e |
| CA-2 | unitaires ; intégration |
| CA-3 | unitaires ; intégration |
| CA-4 | unitaires ; intégration |
| CA-5 | e2e ; @visual |

## 13. Preuves attendues

`evidence/SPEC-409/` contient `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, une vidéo réelle du scénario `@SPEC-409`, captures desktop/mobile, comparaisons visuelles applicables et `acceptance.md` reliant chaque CA au test et à sa sortie. Aucune capture ou réussite n’est déclarée sans fichier effectivement généré.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 est remplie : lint, typecheck, build, tests unitaires et d’intégration filtrés, e2e avec vidéo, au moins un test `@visual`, axe, preuves et absence de régression. La fonction pure reste déterministe à entrée identique, sans I/O, base, IA ni import de `packages/config` ; les services lui transmettent les paramètres métier.

## 15. Décisions et hypothèses

Décisions appliquées : ADR-0033. Les valeurs normatives viennent des règles métier et de la maquette ; aucune valeur produit n’est introduite hors du catalogue. Toute ambiguïté d’implémentation découverte ensuite suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification de la spécification.
