---
id: SPEC-405
title: "Tirage des questions d'une tentative"
phase: P4
priority: V1
depends_on: [SPEC-404]
business_rules: [BR-QUI-03]
screens: []
adrs: [ADR-0014]
visual: demo
---

# SPEC-405 — Tirage des questions d'une tentative

## 1. Objectif

Sélection dans la banque : couverture de chaque notion, surpondération des lacunes, exclusion par empreinte, taille 10-20, répartition choix/ouvertes, signal d'épuisement par notion. La livraison est vérifiable par les contrats, les états d’interface et les critères de la section 11.

## 2. Contexte

Lire `docs/product/business-rules.md` (BR-QUI-03), `docs/architecture/overview.md` §1 et §3, `docs/architecture/data-model.md` §5–§7, `docs/engineering/conventions.md` §2, §6 et §7, `docs/engineering/testing.md` et SPEC-401. ADR applicables : ADR-0014. Le moteur calcule sans accès réseau, base, horloge système ou fournisseur IA ; les services de SPEC-411 persisteront ses sorties.

## 3. Dépendances

- **SPEC-404** — notions en lacune et leur priorité.
- Les algorithmes reçoivent dates, fuseau et paramètres en entrée et renvoient des données typées sans effet de bord. Les services lisent les bornes dans `packages/config/src/product.ts` et les transmettent au moteur ; les démonstrations utilisent l’horloge figée.

## 4. Règles métier couvertes

- **BR-QUI-03** — Chaque tentative tire de **nouvelles** questions de la banque de la notion (aucune question déjà vue, par empreinte), couvre chaque notion du module au moins une fois et surpondère les notions en lacune ; une génération n'a lieu que si la banque est épuisée.

## 5. Exigences fonctionnelles

- **EF-1** — Construire une tentative de quiz de validation de 12 questions par défaut, dans l’intervalle 10–20, couvrant chaque notion du module au moins une fois lorsque le nombre de notions le permet.
- **EF-2** — Surpondérer les notions actuellement en lacune et répartir environ 70 % de questions à choix et 30 % de questions ouvertes, avec au moins une ouverte.
- **EF-3** — Exclure toute question dont l’empreinte a déjà été vue par l’apprenant ; une variante de même empreinte reste exclue même si son identifiant de brique diffère.
- **EF-4** — Ne tirer que des briques actives, valides, possédées par l’apprenant et liées à la notion ; fournir une graine déterministe pour stabiliser l’ordre de la tentative.
- **EF-5** — Si la banque ne permet pas la couverture ou la taille minimale sans répétition, retourner les notions et formats épuisés pour déclencher SPEC-513 ; ne pas inventer de question.

## 6. Exigences techniques

- **ET-1** — `drawAttempt({ notions, bank, seenFingerprints, gaps, targetCount=12, seed })` retourne une liste de références `brickId/brickVersionId` et un rapport `exhausted` par notion.
- **ET-2** — Le tirage déduplique d’abord les empreintes, réserve une question par notion, puis complète jusqu’au plafond par tirage pondéré des lacunes ; le générateur pseudo-aléatoire est injecté par `seed`.
- **ET-3** — Si plus de 20 notions existent, la couverture intégrale dans une seule tentative est impossible : le résultat signale explicitement la limite et choisit selon l’ordre de priorité, sans prétendre satisfaire BR-QUI-03.
- **ET-4** — La fonction du moteur prend un objet d’entrée explicite et retourne un résultat déterministe ; aucune lecture SQL, `fetch`, SDK IA, `Date.now()` ou `new Date()` sans argument n’est autorisée dans `packages/learning-engine`.
- **ET-5** — Exposer les types et fonctions par l’API publique du paquet ; valider les bornes à la frontière du service. Les calculs de temps prennent le fuseau, l’instant et les paramètres configurés comme entrées, puis couvrent les changements d’heure et les ordres d’entrée différents.

## 7. Comportements attendus et cas limites

- **CL-1** — Banque vide : liste de questions vide et toutes les notions épuisées.
- **CL-2** — Deux briques de même empreinte : au plus une retenue.
- **CL-3** — Plus de 20 notions : capacité signalée, pas de dépassement silencieux.
- **CL-4** — Moins d’une question ouverte disponible : rapport d’épuisement du format.
- **CL-5** — Même seed et mêmes données dans un ordre d’entrée différent : tirage identique après tri canonique.

## 8. Instructions d'implémentation

1. Écrire les types d’entrée/sortie et la fonction pure dans `packages/learning-engine/src/questions/draw-attempt.ts`, avec paramètres métier fournis par l’appelant et ordre stable des collections. Commit `feat(SPEC-405): ajoute le calcul déterministe`.
2. Couvrir tous les cas limites de la section 7 par des tests unitaires, y compris exemples chiffrés, propriétés de bornes et répétabilité. Commit `test(SPEC-405): vérifie les invariants du moteur`.
3. Brancher l’API publique du paquet et la page `/_dev/sdd/SPEC-405` ; elle montre les entrées et sorties réellement calculées, sans écriture en base.
4. Ajouter test d’intégration de la composition avec les fonctions déjà livrées, e2e filmé et test visuel de la démonstration.
5. Exécuter `validate.mjs SPEC-405`, consigner les preuves réelles puis `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/learning-engine/src/draw/draw-attempt.ts` (ADR-0284), `packages/learning-engine/src/draw/draw-attempt.test.ts`, `packages/learning-engine/test/integration/draw-attempt.test.ts`, `apps/web/components/sdd-demos/spec-405.tsx`, `apps/web/e2e/specs/p4/spec-405.spec.ts`.
- **Modifiés** : `packages/learning-engine/src/index.ts`, `packages/config/src/product.ts` seulement si une constante normative manque, registre de démonstration SDD.
- **Lus / réutilisés** : `@learny/core`, `@learny/testing`, `ts-fsrs` pour SPEC-402, sorties des dépendances ; dépendances SPEC-404.

## 10. Interface et conformité visuelle

Mode `demo`. Page SDD : liste de notions, lacunes marquées, banque disponible, taille choisie et tableau du tirage avec format/empreinte ; état d’épuisement distinct et lisible. Page `/_dev/sdd/SPEC-405` : afficher les données d’entrée, chaque étape utile et le résultat réellement calculé par le moteur, avec un cas limite visible. Mode `demo` : vérifier jetons, ordre des régions, axe, capture desktop/mobile et `toHaveScreenshot` à 1 %. Aucune maquette métier ne s’applique.

## 11. Critères d'acceptation

- **CA-1** — Sur une banque suffisante de 8 notions, les 12 questions couvrent chacune et incluent au moins une ouverte, avec répartition proche de 70/30.
- **CA-2** — Aucune empreinte déjà vue ni doublon d’empreinte ne figure dans la tentative.
- **CA-3** — À seed égale et entrées permutées, l’ordre et les références sont identiques ; une lacune reçoit la priorité de tirage prévue.
- **CA-4** — Banque épuisée ou plus de 20 notions retourne un rapport explicite, sans question inventée.
- **CA-5** — La démonstration affiche couverture et épuisement, vidéo, axe et test `@visual`.

## 12. Plan de tests

- **Unitaires** — `packages/learning-engine/src/draw/draw-attempt.test.ts`, `describe('[SPEC-405] Tirage des questions d'une tentative')` : couverture, ratio, empreintes et déterminisme, cas limites et propriétés de la section 7 (CA-1 à CA-4).
- **Intégration** — `packages/learning-engine/test/integration/draw-attempt.test.ts`, `describe('[SPEC-405] composition')` : composition avec banque et lacunes, entrée/sortie avec les dépendances et invariance à la répétition (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p4/spec-405.spec.ts`, `test('Tirage des questions d'une tentative @SPEC-405')` : tirage visible et état de banque épuisée dans la démonstration ; conserver vidéo et capture (CA-1, CA-5).
- **Visuel** — `test('Tirage des questions d'une tentative @SPEC-405 @visual')` : jetons, structure, axe, capture desktop/mobile à 1 % (CA-5).
- **Non-régression** — rejouer les étiquettes `[SPEC-404]` / `@SPEC-404`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; e2e |
| CA-2 | unitaires ; intégration |
| CA-3 | unitaires ; intégration |
| CA-4 | unitaires ; intégration |
| CA-5 | e2e ; @visual |

## 13. Preuves attendues

`evidence/SPEC-405/` contient `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, une vidéo réelle du scénario `@SPEC-405`, captures desktop/mobile, comparaisons visuelles applicables et `acceptance.md` reliant chaque CA au test et à sa sortie. Aucune capture ou réussite n’est déclarée sans fichier effectivement généré.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 est remplie : lint, typecheck, build, tests unitaires et d’intégration filtrés, e2e avec vidéo, au moins un test `@visual`, axe, preuves et absence de régression. La fonction pure reste déterministe à entrée identique, sans I/O, base, IA ni import de `packages/config` ; les services lui transmettent les paramètres métier.

## 15. Décisions et hypothèses

Décisions appliquées : ADR-0014, ADR-0143, ADR-0170 et ADR-0284 (contrats d’implémentation du module `src/draw/`, paramètres fournis par l’appelant, formats de la part choix, quotas, rapport d’épuisement et ordre canonique). Les valeurs normatives viennent des règles métier et de la maquette ; aucune valeur produit n’est introduite hors du catalogue. Toute ambiguïté d’implémentation découverte ensuite suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification de la spécification.
