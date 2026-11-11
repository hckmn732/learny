---
id: SPEC-403
title: "Calcul de la maîtrise"
phase: P4
priority: V1
depends_on: [SPEC-401]
business_rules: [BR-LAC-01]
screens: []
adrs: [ADR-0024]
visual: demo
---

# SPEC-403 — Calcul de la maîtrise

## 1. Objectif

Maîtrise pondérée par la récence (demi-vie 14 j), scores partiels, seuil, tests par propriétés (bornes, monotonie). La livraison est vérifiable par les contrats, les états d’interface et les critères de la section 11.

## 2. Contexte

Lire `docs/product/business-rules.md` (BR-LAC-01), `docs/architecture/overview.md` §1 et §3, `docs/architecture/data-model.md` §5–§7, `docs/engineering/conventions.md` §2, §6 et §7, `docs/engineering/testing.md` et SPEC-401. ADR applicables : ADR-0024. Le moteur calcule sans accès réseau, base, horloge système ou fournisseur IA ; les services de SPEC-411 persisteront ses sorties.

## 3. Dépendances

- **SPEC-401** — types de réponse et convention de calcul pur.
- Les algorithmes reçoivent dates, fuseau et paramètres en entrée et renvoient des données typées sans effet de bord. Les services lisent les bornes dans `packages/config/src/product.ts` et les transmettent au moteur ; les démonstrations utilisent l’horloge figée.

## 4. Règles métier couvertes

- **BR-LAC-01** — Maîtrise d'une notion (0 à 100 %) = moyenne pondérée des réussites de toutes ses réponses, poids = 0,5^(âge en jours / 14). Seuil de maîtrise : 80 %.

## 5. Exigences fonctionnelles

- **EF-1** — Calculer la maîtrise d’une notion sur toutes ses réponses notées : moyenne des scores partiels dans [0,1] pondérée par 0,5^(âge en jours / 14). Retourner un pourcentage dans [0,100].
- **EF-2** — Le seuil de maîtrise est 80 %. Une réponse à 0,5 contribue pour moitié d’une réussite complète, sans arrondi intermédiaire.
- **EF-3** — La date d’évaluation est une entrée explicite ; une réponse future ou un score hors [0,1] est rejeté à la frontière du contrat.
- **EF-4** — Exposer le détail utile à l’explication : nombre de réponses retenues, somme des poids, score pondéré et statut maîtrisé/non maîtrisé.
- **EF-5** — Une notion sans réponse a une maîtrise 0 % et n’est pas considérée comme maîtrisée.

## 6. Exigences techniques

- **ET-1** — `calculateMastery({ answers, at, threshold=80 })` est pure ; chaque réponse a `score`, `answeredAt` et une référence de tentative.
- **ET-2** — `ageDays` utilise la durée écoulée en millisecondes / 86 400 000 ; le poids est `Math.pow(0.5, ageDays / 14)`. Les calculs sont en double précision et seul l’affichage arrondit.
- **ET-3** — Les réponses sont traitées indépendamment de leur ordre. En absence de poids, retourner 0 plutôt qu’une division par zéro.
- **ET-4** — La fonction du moteur prend un objet d’entrée explicite et retourne un résultat déterministe ; aucune lecture SQL, `fetch`, SDK IA, `Date.now()` ou `new Date()` sans argument n’est autorisée dans `packages/learning-engine`.
- **ET-5** — Exposer les types et fonctions par l’API publique du paquet ; valider les bornes à la frontière du service. Les calculs de temps prennent le fuseau, l’instant et les paramètres configurés comme entrées, puis couvrent les changements d’heure et les ordres d’entrée différents.

## 7. Comportements attendus et cas limites

- **CL-1** — Liste vide : 0 %, non maîtrisée.
- **CL-2** — Deux scores identiques mais ancien/récent : le récent pèse davantage.
- **CL-3** — Réponse future : erreur de validation ; pas de poids supérieur à 1.
- **CL-4** — Score partiel exactement 0 ou 1 : bornes incluses.
- **CL-5** — Ordre permuté : même résultat à tolérance numérique définie dans le test.

## 8. Instructions d'implémentation

1. Écrire les types d’entrée/sortie et la fonction pure dans `packages/learning-engine/src/mastery/calculate.ts`, avec paramètres métier fournis par l’appelant et ordre stable des collections. Commit `feat(SPEC-403): ajoute le calcul déterministe`.
2. Couvrir tous les cas limites de la section 7 par des tests unitaires, y compris exemples chiffrés, propriétés de bornes et répétabilité. Commit `test(SPEC-403): vérifie les invariants du moteur`.
3. Brancher l’API publique du paquet et la page `/_dev/sdd/SPEC-403` ; elle montre les entrées et sorties réellement calculées, sans écriture en base.
4. Ajouter test d’intégration de la composition avec les fonctions déjà livrées, e2e filmé et test visuel de la démonstration.
5. Exécuter `validate.mjs SPEC-403`, consigner les preuves réelles puis `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/learning-engine/src/mastery/calculate.ts`, `packages/learning-engine/src/mastery/calculate.test.ts`, `packages/learning-engine/test/integration/mastery.test.ts`, `apps/web/components/sdd-demos/spec-403.tsx`, `apps/web/e2e/specs/p4/spec-403.spec.ts`.
- **Modifiés** : `packages/learning-engine/src/index.ts`, `packages/config/src/product.ts` seulement si une constante normative manque, registre de démonstration SDD.
- **Lus / réutilisés** : `@learny/core`, `@learny/testing`, `ts-fsrs` pour SPEC-402, sorties des dépendances ; dépendances SPEC-401.

## 10. Interface et conformité visuelle

Mode `demo`. Page SDD : tableau de deux réponses datées avec score et poids, formule affichée, barre de maîtrise et seuil 80 %. Le bouton « Ajouter une réponse » modifie seulement l’exemple local et recalcule par la fonction pure. Page `/_dev/sdd/SPEC-403` : afficher les données d’entrée, chaque étape utile et le résultat réellement calculé par le moteur, avec un cas limite visible. Mode `demo` : vérifier jetons, ordre des régions, axe, capture desktop/mobile et `toHaveScreenshot` à 1 %. Aucune maquette métier ne s’applique.

## 11. Critères d'acceptation

- **CA-1** — Deux réponses à 100 % et 0 %, espacées de 14 jours, donnent 33,333… % si la réussite est l’ancienne, 66,666… % si elle est la récente.
- **CA-2** — Une seule réponse à 80 % donne exactement le seuil 80 % ; 79,999 % reste sous le seuil.
- **CA-3** — Pour tout jeu valide, le résultat reste entre 0 et 100, est invariant à la permutation et ne diminue pas quand un score augmente à date égale.
- **CA-4** — Entrée vide, future ou hors bornes produit le comportement CL correspondant sans `NaN` ni mutation.
- **CA-5** — La page SDD affiche poids et résultat calculés, avec vidéo et test `@visual` sans violation axe.

## 12. Plan de tests

- **Unitaires** — `packages/learning-engine/src/mastery/calculate.test.ts`, `describe('[SPEC-403] Calcul de la maîtrise')` : exemple chiffré et propriétés de bornes, cas limites et propriétés de la section 7 (CA-1 à CA-4).
- **Intégration** — `packages/learning-engine/test/integration/mastery.test.ts`, `describe('[SPEC-403] composition')` : composition avec les types de réponses du moteur, entrée/sortie avec les dépendances et invariance à la répétition (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p4/spec-403.spec.ts`, `test('Calcul de la maîtrise @SPEC-403')` : modification d’une réponse et recalcul de la barre dans la démonstration ; conserver vidéo et capture (CA-1, CA-5).
- **Visuel** — `test('Calcul de la maîtrise @SPEC-403 @visual')` : jetons, structure, axe, capture desktop/mobile à 1 % (CA-5).
- **Non-régression** — rejouer les étiquettes `[SPEC-401]` / `@SPEC-401`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; e2e |
| CA-2 | unitaires ; intégration |
| CA-3 | unitaires ; intégration |
| CA-4 | unitaires ; intégration |
| CA-5 | e2e ; @visual |

## 13. Preuves attendues

`evidence/SPEC-403/` contient `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, une vidéo réelle du scénario `@SPEC-403`, captures desktop/mobile, comparaisons visuelles applicables et `acceptance.md` reliant chaque CA au test et à sa sortie. Aucune capture ou réussite n’est déclarée sans fichier effectivement généré.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 est remplie : lint, typecheck, build, tests unitaires et d’intégration filtrés, e2e avec vidéo, au moins un test `@visual`, axe, preuves et absence de régression. La fonction pure reste déterministe à entrée identique, sans I/O, base, IA ni import de `packages/config` ; les services lui transmettent les paramètres métier.

## 15. Décisions et hypothèses

Décisions appliquées : ADR-0024. Les valeurs normatives viennent des règles métier et de la maquette ; aucune valeur produit n’est introduite hors du catalogue. Toute ambiguïté d’implémentation découverte ensuite suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification de la spécification.
