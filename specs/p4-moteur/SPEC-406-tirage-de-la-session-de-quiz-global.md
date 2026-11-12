---
id: SPEC-406
title: "Tirage de la session de quiz global"
phase: P4
priority: V1
depends_on: [SPEC-402, SPEC-404]
business_rules: [BR-MEM-03, BR-MEM-04]
screens: []
adrs: [ADR-0025]
visual: demo
---

# SPEC-406 — Tirage de la session de quiz global

## 1. Objectif

Notions dues, lacunes en tête, entrelacement des modules, plafond de durée et lissage (report des moins urgentes), variation des formats, choix du format selon la nature de la lacune (préférences), mode micro-séance, entretien léger. La livraison est vérifiable par les contrats, les états d’interface et les critères de la section 11.

## 2. Contexte

Lire `docs/product/business-rules.md` (BR-MEM-03, BR-MEM-04), `docs/architecture/overview.md` §1 et §3, `docs/architecture/data-model.md` §5–§7, `docs/engineering/conventions.md` §2, §6 et §7, `docs/engineering/testing.md` et SPEC-401. ADR applicables : ADR-0025. Le moteur calcule sans accès réseau, base, horloge système ou fournisseur IA ; les services de SPEC-411 persisteront ses sorties.

## 3. Dépendances

- **SPEC-402** — notions dues et formats de révision.
- **SPEC-404** — lacunes actives et priorité.
- Les algorithmes reçoivent dates, fuseau et paramètres en entrée et renvoient des données typées sans effet de bord. Les services lisent les bornes dans `packages/config/src/product.ts` et les transmettent au moteur ; les démonstrations utilisent l’horloge figée.

## 4. Règles métier couvertes

- **BR-MEM-03** — Quiz global propre à chaque formation : chaque jour, les notions dues (FSRS) de tous les modules validés et du module en cours déjà évalué, lacunes en tête, modules entrelacés, durée plafonnée (automatisme 7). Chaque module validé y ajoute ses notions.
- **BR-MEM-04** — Une même notion ne revient pas deux fois de suite sous le même format ; le tuteur varie question, texte à trous, association, etc.

## 5. Exigences fonctionnelles

- **EF-1** — Construire pour chaque formation une session du jour à partir des notions dues de modules validés et des notions déjà évaluées du module courant ; placer les lacunes en tête et entrelacer les modules.
- **EF-2** — Respecter un plafond de durée configurable en reportant les notions les moins urgentes, tout en retournant leur liste et leur prochaine date proposée ; ne jamais marquer une notion reportée comme révisée.
- **EF-3** — Varier le format d’une notion par rapport à sa dernière présentation ; respecter un format imposé par la nature de la lacune et les préférences quand le format existe dans la banque.
- **EF-4** — Le mode micro-séance sélectionne un sous-ensemble court sans modifier l’échéance des notions non jouées ; le mode entretien léger de formation terminée limite la session à cinq minutes et aux seules notions dues.
- **EF-5** — À date, seed, état FSRS et banques identiques, produire la même liste ordonnée de notions et formats.

## 6. Exigences techniques

- **ET-1** — `buildDailySession({ formationId, date, dueNotions, gaps, bank, lastFormats, capMinutes, mode, seed })` retourne `items`, `deferred`, `estimatedMinutes` et `reason` par élément.
- **ET-2** — Le tri initial est stable par priorité de lacune, échéance FSRS, module et identifiant ; l’entrelacement évite deux éléments du même module tant qu’un autre module éligible reste disponible.
- **ET-3** — Les formats disponibles sont filtrés par type de brique valide ; un format imposé indisponible retourne un signal d’épuisement pour SPEC-513 plutôt qu’un faux item.
- **ET-4** — La fonction du moteur prend un objet d’entrée explicite et retourne un résultat déterministe ; aucune lecture SQL, `fetch`, SDK IA, `Date.now()` ou `new Date()` sans argument n’est autorisée dans `packages/learning-engine`.
- **ET-5** — Exposer les types et fonctions par l’API publique du paquet ; valider les bornes à la frontière du service. Les calculs de temps prennent le fuseau, l’instant et les paramètres configurés comme entrées, puis couvrent les changements d’heure et les ordres d’entrée différents.

## 7. Comportements attendus et cas limites

- **CL-1** — Aucune notion due : session vide et durée 0.
- **CL-2** — Une seule formation avec un module : aucun entrelacement artificiel.
- **CL-3** — Plafond inférieur à la durée du premier item : retourner une session vide et un report explicite.
- **CL-4** — Dernier format seul disponible : réutilisation signalée comme contrainte de banque, demande de variante.
- **CL-5** — Notion due mais module courant jamais évalué : elle n’entre pas dans la session.

## 8. Instructions d'implémentation

1. Écrire les types d’entrée/sortie et la fonction pure dans `packages/learning-engine/src/session/build-daily-session.ts`, avec paramètres métier fournis par l’appelant et ordre stable des collections. Commit `feat(SPEC-406): ajoute le calcul déterministe`.
2. Couvrir tous les cas limites de la section 7 par des tests unitaires, y compris exemples chiffrés, propriétés de bornes et répétabilité. Commit `test(SPEC-406): vérifie les invariants du moteur`.
3. Brancher l’API publique du paquet et la page `/_dev/sdd/SPEC-406` ; elle montre les entrées et sorties réellement calculées, sans écriture en base.
4. Ajouter test d’intégration de la composition avec les fonctions déjà livrées, e2e filmé et test visuel de la démonstration.
5. Exécuter `validate.mjs SPEC-406`, consigner les preuves réelles puis `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/learning-engine/src/session/build-daily-session.ts`, `packages/learning-engine/src/session/interleave.ts`, `packages/learning-engine/src/session/build-daily-session.test.ts`, `packages/learning-engine/test/integration/session.test.ts`, `apps/web/components/sdd-demos/spec-406.tsx`, `apps/web/e2e/specs/p4/spec-406.spec.ts`.
- **Modifiés** : `packages/learning-engine/src/index.ts`, `packages/config/src/product.ts` seulement si une constante normative manque, registre de démonstration SDD.
- **Lus / réutilisés** : `@learny/core`, `@learny/testing`, `ts-fsrs` pour SPEC-402, sorties des dépendances ; dépendances SPEC-402, SPEC-404.

## 10. Interface et conformité visuelle

Mode `demo`. Page SDD : colonnes « Dues », « Sélectionnées », « Reportées », durée/plafond et badges de format ; le changement de mode full/micro/entretien recalcule le résultat pur. Page `/_dev/sdd/SPEC-406` : afficher les données d’entrée, chaque étape utile et le résultat réellement calculé par le moteur, avec un cas limite visible. Mode `demo` : vérifier jetons, ordre des régions, axe, capture desktop/mobile et `toHaveScreenshot` à 1 %. Aucune maquette métier ne s’applique.

## 11. Critères d'acceptation

- **CA-1** — Une session avec trois modules alterne les modules lorsque possible et place les lacunes avant les notions sans lacune.
- **CA-2** — La durée estimée ne dépasse pas le plafond ; toute notion exclue figure dans `deferred` et son état FSRS demeure inchangé.
- **CA-3** — Une notion ne reprend pas son dernier format si un autre format valide existe ; format imposé et préférence sont appliqués lorsque disponibles.
- **CA-4** — Le mode entretien léger ne contient que les notions dues et dure au plus cinq minutes ; mêmes entrées et seed donnent le même résultat.
- **CA-5** — La démonstration montre session, durée et reports, avec vidéo, axe et test `@visual`.

## 12. Plan de tests

- **Unitaires** — `packages/learning-engine/src/session/build-daily-session.test.ts`, `describe('[SPEC-406] Tirage de la session de quiz global')` : lacunes, entrelacement, formats et plafond, cas limites et propriétés de la section 7 (CA-1 à CA-4).
- **Intégration** — `packages/learning-engine/test/integration/session.test.ts`, `describe('[SPEC-406] composition')` : composition FSRS/banque et stabilité à seed égale, entrée/sortie avec les dépendances et invariance à la répétition (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p4/spec-406.spec.ts`, `test('Tirage de la session de quiz global @SPEC-406')` : changement de mode et lecture des reports dans la démonstration ; conserver vidéo et capture (CA-1, CA-5).
- **Visuel** — `test('Tirage de la session de quiz global @SPEC-406 @visual')` : jetons, structure, axe, capture desktop/mobile à 1 % (CA-5).
- **Non-régression** — rejouer les étiquettes `[SPEC-402]` / `@SPEC-402`, `[SPEC-404]` / `@SPEC-404`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; e2e |
| CA-2 | unitaires ; intégration |
| CA-3 | unitaires ; intégration |
| CA-4 | unitaires ; intégration |
| CA-5 | e2e ; @visual |

## 13. Preuves attendues

`evidence/SPEC-406/` contient `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, une vidéo réelle du scénario `@SPEC-406`, captures desktop/mobile, comparaisons visuelles applicables et `acceptance.md` reliant chaque CA au test et à sa sortie. Aucune capture ou réussite n’est déclarée sans fichier effectivement généré.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 est remplie : lint, typecheck, build, tests unitaires et d’intégration filtrés, e2e avec vidéo, au moins un test `@visual`, axe, preuves et absence de régression. La fonction pure reste déterministe à entrée identique, sans I/O, base, IA ni import de `packages/config` ; les services lui transmettent les paramètres métier.

## 15. Décisions et hypothèses

Décisions appliquées : ADR-0025, ADR-0287. Les valeurs normatives viennent des règles métier et de la maquette ; aucune valeur produit n’est introduite hors du catalogue. Toute ambiguïté d’implémentation découverte ensuite suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification de la spécification.
