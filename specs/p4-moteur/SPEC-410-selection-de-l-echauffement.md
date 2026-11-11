---
id: SPEC-410
title: "Sélection de l'échauffement"
phase: P4
priority: V1
depends_on: [SPEC-402, SPEC-404]
business_rules: [BR-AUT-03]
screens: []
adrs: []
visual: demo
---

# SPEC-410 — Sélection de l'échauffement

## 1. Objectif

Choix de N notions : vues la veille et prérequis du chapitre à venir (liens prerequisite), portée paramétrable, exclusion des notions non encore vues. La livraison est vérifiable par les contrats, les états d’interface et les critères de la section 11.

## 2. Contexte

Lire `docs/product/business-rules.md` (BR-AUT-03), `docs/architecture/overview.md` §1 et §3, `docs/architecture/data-model.md` §5–§7, `docs/engineering/conventions.md` §2, §6 et §7, `docs/engineering/testing.md` et SPEC-401. Le moteur calcule sans accès réseau, base, horloge système ou fournisseur IA ; les services de SPEC-411 persisteront ses sorties.

## 3. Dépendances

- **SPEC-402** — notions déjà vues et dates locales.
- **SPEC-404** — priorité des lacunes.
- Les algorithmes reçoivent dates, fuseau et paramètres en entrée et renvoient des données typées sans effet de bord. Les services lisent les bornes dans `packages/config/src/product.ts` et les transmettent au moteur ; les démonstrations utilisent l’horloge figée.

## 4. Règles métier couvertes

- **BR-AUT-03** — **Échauffement** : chaque séance commence par N questions de rappel (défaut 3 ; 2/3/5) portant sur les notions vues la veille et les prérequis du chapitre (liens « prérequis » de la carte), ou la veille seulement ; « Je savais » / « À revoir » ; une notion « à revoir » passe dans le quiz global du soir.

## 5. Exigences fonctionnelles

- **EF-1** — Sélectionner 2, 3 ou 5 notions pour l’échauffement, trois par défaut, parmi les notions vues la veille locale et les prérequis du chapitre à venir.
- **EF-2** — Le réglage de portée « veille seulement » exclut les prérequis ; le réglage combiné les inclut sans doublon.
- **EF-3** — Exclure toute notion jamais vue, suspendue, hors formation ou appartenant à un chapitre qui n’est pas encore accessible.
- **EF-4** — Donner priorité aux notions vues la veille puis aux prérequis pertinents, avec tirage stable à seed identique et variété lorsqu’il existe plus de candidats que la taille demandée.
- **EF-5** — Retourner la raison de chaque choix (`yesterday` ou `prerequisite`) pour que SPEC-714 puisse afficher l’explication ; le moteur ne corrige pas la réponse de l’apprenant.

## 6. Exigences techniques

- **ET-1** — `selectWarmup({ seenNotions, prerequisiteLinks, nextChapterId, localDate, scope, count=3, seed })` retourne `{notionId, reason}[]` de longueur ≤ count.
- **ET-2** — Les liens `prerequisite` de `notion_links` sont parcourus dans le sens défini par le schéma et dédupliqués par identifiant de notion ; la date « hier » est calculée dans le fuseau de l’utilisateur.
- **ET-3** — La fonction est pure, trie les candidats canoniquement avant le tirage et ne met pas à jour FSRS ; SPEC-714 traite Je savais/À revoir et SPEC-411 persiste les réponses.
- **ET-4** — La fonction du moteur prend un objet d’entrée explicite et retourne un résultat déterministe ; aucune lecture SQL, `fetch`, SDK IA, `Date.now()` ou `new Date()` sans argument n’est autorisée dans `packages/learning-engine`.
- **ET-5** — Exposer les types et fonctions par l’API publique du paquet ; valider les bornes à la frontière du service. Les calculs de temps prennent le fuseau, l’instant et les paramètres configurés comme entrées, puis couvrent les changements d’heure et les ordres d’entrée différents.

## 7. Comportements attendus et cas limites

- **CL-1** — Moins de N candidates : retourner seulement les éligibles, sans question factice.
- **CL-2** — Aucune notion vue hier et portée veille seulement : liste vide.
- **CL-3** — Prérequise jamais étudiée : exclue malgré le lien.
- **CL-4** — Même notion dans hier et prérequis : un seul item, raison `yesterday` prioritaire.
- **CL-5** — Jour local autour du changement d’heure : « hier » suit le calendrier local, pas 24 h UTC.

## 8. Instructions d'implémentation

1. Écrire les types d’entrée/sortie et la fonction pure dans `packages/learning-engine/src/warmup/select.ts`, avec paramètres métier fournis par l’appelant et ordre stable des collections. Commit `feat(SPEC-410): ajoute le calcul déterministe`.
2. Couvrir tous les cas limites de la section 7 par des tests unitaires, y compris exemples chiffrés, propriétés de bornes et répétabilité. Commit `test(SPEC-410): vérifie les invariants du moteur`.
3. Brancher l’API publique du paquet et la page `/_dev/sdd/SPEC-410` ; elle montre les entrées et sorties réellement calculées, sans écriture en base.
4. Ajouter test d’intégration de la composition avec les fonctions déjà livrées, e2e filmé et test visuel de la démonstration.
5. Exécuter `validate.mjs SPEC-410`, consigner les preuves réelles puis `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/learning-engine/src/warmup/select.ts`, `packages/learning-engine/src/warmup/select.test.ts`, `packages/learning-engine/test/integration/warmup.test.ts`, `apps/web/components/sdd-demos/spec-410.tsx`, `apps/web/e2e/specs/p4/spec-410.spec.ts`.
- **Modifiés** : `packages/learning-engine/src/index.ts`, `packages/config/src/product.ts` seulement si une constante normative manque, registre de démonstration SDD.
- **Lus / réutilisés** : `@learny/core`, `@learny/testing`, `ts-fsrs` pour SPEC-402, sorties des dépendances ; dépendances SPEC-402, SPEC-404.

## 10. Interface et conformité visuelle

Mode `demo`. Page SDD : date locale, chapitre à venir, choix de portée et taille 2/3/5 ; cartes des notions sélectionnées avec raison « Vue hier » ou « Prérequis » et état vide distinct. Page `/_dev/sdd/SPEC-410` : afficher les données d’entrée, chaque étape utile et le résultat réellement calculé par le moteur, avec un cas limite visible. Mode `demo` : vérifier jetons, ordre des régions, axe, capture desktop/mobile et `toHaveScreenshot` à 1 %. Aucune maquette métier ne s’applique.

## 11. Critères d'acceptation

- **CA-1** — Avec 2 notions vues hier et 2 prérequis vus auparavant, le mode combiné de taille 3 renvoie trois identifiants uniques ; veille seulement renvoie les 2 de la veille.
- **CA-2** — Une notion jamais vue ou suspendue n’apparaît jamais, même liée comme prérequis.
- **CA-3** — Les tailles 2/3/5 et la seed donnent un résultat stable, sans doublon ; une banque courte retourne moins de N.
- **CA-4** — La date hier est évaluée dans le fuseau de l’apprenant au passage d’heure.
- **CA-5** — La page SDD explique chaque choix avec vidéo, axe et test `@visual`.

## 12. Plan de tests

- **Unitaires** — `packages/learning-engine/src/warmup/select.test.ts`, `describe('[SPEC-410] Sélection de l'échauffement')` : tailles, portée, déduplication et filtre jamais vu, cas limites et propriétés de la section 7 (CA-1 à CA-4).
- **Intégration** — `packages/learning-engine/test/integration/warmup.test.ts`, `describe('[SPEC-410] composition')` : composition avec liens de prérequis et état FSRS, entrée/sortie avec les dépendances et invariance à la répétition (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p4/spec-410.spec.ts`, `test('Sélection de l'échauffement @SPEC-410')` : changement de portée dans la démonstration dans la démonstration ; conserver vidéo et capture (CA-1, CA-5).
- **Visuel** — `test('Sélection de l'échauffement @SPEC-410 @visual')` : jetons, structure, axe, capture desktop/mobile à 1 % (CA-5).
- **Non-régression** — rejouer les étiquettes `[SPEC-402]` / `@SPEC-402`, `[SPEC-404]` / `@SPEC-404`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; e2e |
| CA-2 | unitaires ; intégration |
| CA-3 | unitaires ; intégration |
| CA-4 | unitaires ; intégration |
| CA-5 | e2e ; @visual |

## 13. Preuves attendues

`evidence/SPEC-410/` contient `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, une vidéo réelle du scénario `@SPEC-410`, captures desktop/mobile, comparaisons visuelles applicables et `acceptance.md` reliant chaque CA au test et à sa sortie. Aucune capture ou réussite n’est déclarée sans fichier effectivement généré.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 est remplie : lint, typecheck, build, tests unitaires et d’intégration filtrés, e2e avec vidéo, au moins un test `@visual`, axe, preuves et absence de régression. La fonction pure reste déterministe à entrée identique, sans I/O, base, IA ni import de `packages/config` ; les services lui transmettent les paramètres métier.

## 15. Décisions et hypothèses

Les valeurs normatives viennent des règles métier et de la maquette ; aucune valeur produit n’est introduite hors du catalogue. Toute ambiguïté d’implémentation découverte ensuite suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification de la spécification.
