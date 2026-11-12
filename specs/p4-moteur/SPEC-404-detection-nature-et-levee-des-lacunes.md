---
id: SPEC-404
title: "Détection, nature et levée des lacunes"
phase: P4
priority: V1
depends_on: [SPEC-402, SPEC-403]
business_rules: [BR-LAC-02, BR-LAC-03, BR-LAC-04, BR-LAC-06]
screens: []
adrs: [ADR-0024]
visual: demo
---

# SPEC-404 — Détection, nature et levée des lacunes

## 1. Objectif

Détection après tentative, même erreur répétée, nature (oubli, confusion avec notion confondue, incompréhension, application) et priorité, réponse recommandée par nature, levée (2 réussites espacées + seuil). La livraison est vérifiable par les contrats, les états d’interface et les critères de la section 11.

## 2. Contexte

Lire `docs/product/business-rules.md` (BR-LAC-02, BR-LAC-03, BR-LAC-04, BR-LAC-06), `docs/architecture/overview.md` §1 et §3, `docs/architecture/data-model.md` §5–§7, `docs/engineering/conventions.md` §2, §6 et §7, `docs/engineering/testing.md` et SPEC-401. ADR applicables : ADR-0024. Le moteur calcule sans accès réseau, base, horloge système ou fournisseur IA ; les services de SPEC-411 persisteront ses sorties.

## 3. Dépendances

- **SPEC-402** — note FSRS et historique de révision.
- **SPEC-403** — maîtrise pondérée et seuil.
- Les algorithmes reçoivent dates, fuseau et paramètres en entrée et renvoient des données typées sans effet de bord. Les services lisent les bornes dans `packages/config/src/product.ts` et les transmettent au moteur ; les démonstrations utilisent l’horloge figée.

## 4. Règles métier couvertes

- **BR-LAC-02** — Une notion devient une lacune si sa maîtrise reste sous le seuil après une tentative de quiz de validation, d'examen ou d'exercice, ou si la même erreur (même distracteur ou même réponse fausse normalisée) revient lors de deux tentatives.
- **BR-LAC-03** — Nature d'une lacune : **oubli** (notion réussie au moins une fois puis échouée ≥ 7 jours après, ou signalée par FSRS) ; **confusion** (le distracteur choisi représente une autre notion, ou erreur d'association/classement entre deux notions) ; **incompréhension** (≥ 2 échecs sur la notion dont au moins une réponse ouverte jugée hors sujet) ; **difficulté d'application** (questions de définition réussies mais exercice échoué). En cas de cumul, priorité : confusion > difficulté d'application > incompréhension > oubli.
- **BR-LAC-04** — Réponse du tuteur selon la nature : oubli → révision dans le quiz global ; confusion → question qui oppose les deux notions et comparaison côte à côte ; incompréhension → nouvelle explication sous un autre angle ; difficulté d'application → exercice pratique.
- **BR-LAC-06** — Une lacune est levée quand la notion est réussie au moins 2 fois à au moins 1 jour d'intervalle et que sa maîtrise atteint le seuil.

## 5. Exigences fonctionnelles

- **EF-1** — Détecter une lacune si la maîtrise reste sous 80 % après quiz de validation, examen ou exercice, ou si la même erreur revient sur deux tentatives distinctes.
- **EF-2** — Normaliser une erreur ouverte en minuscules sans accents et espaces superflus ; une erreur à choix est identique par identifiant de distracteur. Deux réponses d’une même tentative ne forment pas une répétition.
- **EF-3** — Classer oubli, confusion, incompréhension et difficulté d’application selon BR-LAC-03, avec priorité confusion > application > incompréhension > oubli et identifiant de notion confondue lorsque disponible.
- **EF-4** — Renvoyer la remédiation attendue : oubli → quiz global, confusion → opposition côte à côte, incompréhension → autre explication, application → exercice pratique.
- **EF-5** — Lever la lacune seulement après deux réussites espacées d’au moins un jour et une maîtrise ≥ 80 % ; conserver l’événement de levée pour l’historique.

## 6. Exigences techniques

- **ET-1** — `detectGap({ notion, attempts, mastery, now })` retourne `{active, nature, confusedWith, evidence, recommendedAction}` sans I/O.
- **ET-2** — `clearGap({ gap, successes, mastery, now })` vérifie deux réussites séparées par au moins 24 h et le seuil 80 ; une réussite d’échauffement ou de quiz est comptée si son résultat appartient à la notion.
- **ET-3** — Le résultat contient le type d’événement `detected|nature_changed|cleared|null` ; SPEC-411 le persiste dans `gap_events`.
- **ET-4** — La fonction du moteur prend un objet d’entrée explicite et retourne un résultat déterministe ; aucune lecture SQL, `fetch`, SDK IA, `Date.now()` ou `new Date()` sans argument n’est autorisée dans `packages/learning-engine`.
- **ET-5** — Exposer les types et fonctions par l’API publique du paquet ; valider les bornes à la frontière du service. Les calculs de temps prennent le fuseau, l’instant et les paramètres configurés comme entrées, puis couvrent les changements d’heure et les ordres d’entrée différents.

## 7. Comportements attendus et cas limites

- **CL-1** — Maîtrise basse avant toute tentative qualifiante : pas de lacune créée par ce seul fait.
- **CL-2** — Confusion et oubli simultanés : confusion l’emporte.
- **CL-3** — Même réponse erronée sur deux items dans une tentative : pas de déclenchement de répétition.
- **CL-4** — Deux réussites à 23 h 59 d’intervalle : lacune maintenue.
- **CL-5** — Nature changée : événement `nature_changed`, pas une deuxième lacune active.

## 8. Instructions d'implémentation

1. Écrire les types d’entrée/sortie et la fonction pure dans `packages/learning-engine/src/gaps/detect.ts`, avec paramètres métier fournis par l’appelant et ordre stable des collections. Commit `feat(SPEC-404): ajoute le calcul déterministe`.
2. Couvrir tous les cas limites de la section 7 par des tests unitaires, y compris exemples chiffrés, propriétés de bornes et répétabilité. Commit `test(SPEC-404): vérifie les invariants du moteur`.
3. Brancher l’API publique du paquet et la page `/_dev/sdd/SPEC-404` ; elle montre les entrées et sorties réellement calculées, sans écriture en base.
4. Ajouter test d’intégration de la composition avec les fonctions déjà livrées, e2e filmé et test visuel de la démonstration.
5. Exécuter `validate.mjs SPEC-404`, consigner les preuves réelles puis `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/learning-engine/src/gaps/detect.ts`, `packages/learning-engine/src/gaps/normalize-error.ts`, `packages/learning-engine/src/gaps/detect.test.ts`, `packages/learning-engine/test/integration/gaps.test.ts`, `apps/web/components/sdd-demos/spec-404.tsx`, `apps/web/e2e/specs/p4/spec-404.spec.ts`.
- **Modifiés** : `packages/learning-engine/src/index.ts`, `packages/config/src/product.ts` seulement si une constante normative manque, registre de démonstration SDD.
- **Lus / réutilisés** : `@learny/core`, `@learny/testing`, `ts-fsrs` pour SPEC-402, sorties des dépendances ; dépendances SPEC-402, SPEC-403.

## 10. Interface et conformité visuelle

Mode `demo`. Page SDD : deux tentatives d’une notion fictive, score de maîtrise, nature détectée et remédiation ; second état avec deux réussites datées et lacune levée. Aucun résultat n’est codé en dur. Page `/_dev/sdd/SPEC-404` : afficher les données d’entrée, chaque étape utile et le résultat réellement calculé par le moteur, avec un cas limite visible. Mode `demo` : vérifier jetons, ordre des régions, axe, capture desktop/mobile et `toHaveScreenshot` à 1 %. Aucune maquette métier ne s’applique.

## 11. Critères d'acceptation

- **CA-1** — Après une tentative qualifiante sous 80 %, une lacune est détectée ; sans tentative et avec maîtrise basse, aucune détection n’a lieu.
- **CA-2** — Une erreur normalisée répétée dans deux tentatives détecte la lacune ; deux erreurs d’une seule tentative ne le font pas.
- **CA-3** — Les quatre natures et leur priorité sont déterminées exactement selon BR-LAC-03 et renvoient l’action BR-LAC-04.
- **CA-4** — Deux réussites à 24 h d’intervalle et maîtrise 80 % lèvent la lacune ; 23 h 59 ou 79,99 % ne la lèvent pas.
- **CA-5** — La démonstration montre détection, nature et levée avec vidéo, axe et test `@visual`.

## 12. Plan de tests

- **Unitaires** — `packages/learning-engine/src/gaps/detect.test.ts`, `describe('[SPEC-404] Détection, nature et levée des lacunes')` : normalisation, natures et priorité, cas limites et propriétés de la section 7 (CA-1 à CA-4).
- **Intégration** — `packages/learning-engine/test/integration/gaps.test.ts`, `describe('[SPEC-404] composition')` : composition avec maîtrise et FSRS, entrée/sortie avec les dépendances et invariance à la répétition (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p4/spec-404.spec.ts`, `test('Détection, nature et levée des lacunes @SPEC-404')` : simulation de détection puis levée dans la démonstration ; conserver vidéo et capture (CA-1, CA-5).
- **Visuel** — `test('Détection, nature et levée des lacunes @SPEC-404 @visual')` : jetons, structure, axe, capture desktop/mobile à 1 % (CA-5).
- **Non-régression** — rejouer les étiquettes `[SPEC-402]` / `@SPEC-402`, `[SPEC-403]` / `@SPEC-403`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; e2e |
| CA-2 | unitaires ; intégration |
| CA-3 | unitaires ; intégration |
| CA-4 | unitaires ; intégration |
| CA-5 | e2e ; @visual |

## 13. Preuves attendues

`evidence/SPEC-404/` contient `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, une vidéo réelle du scénario `@SPEC-404`, captures desktop/mobile, comparaisons visuelles applicables et `acceptance.md` reliant chaque CA au test et à sa sortie. Aucune capture ou réussite n’est déclarée sans fichier effectivement généré.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 est remplie : lint, typecheck, build, tests unitaires et d’intégration filtrés, e2e avec vidéo, au moins un test `@visual`, axe, preuves et absence de régression. La fonction pure reste déterministe à entrée identique, sans I/O, base, IA ni import de `packages/config` ; les services lui transmettent les paramètres métier.

## 15. Décisions et hypothèses

Décisions appliquées : ADR-0024, ADR-0282. Les valeurs normatives viennent des règles métier et de la maquette ; aucune valeur produit n’est introduite hors du catalogue. ADR-0282 précise la tentative qualifiante retenue, les durées absolues (24 h et 7 × 24 h), la nature résiduelle `misunderstanding`, le sens unique des changements de nature et le filtrage des réussites de levée. Toute ambiguïté d'implémentation découverte ensuite suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification de la spécification.
