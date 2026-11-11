---
id: SPEC-402
title: "Répétition espacée FSRS par notion"
phase: P4
priority: V1
depends_on: [SPEC-401]
business_rules: [BR-MEM-01, BR-MEM-02]
screens: []
adrs: [ADR-0025]
visual: demo
---

# SPEC-402 — Répétition espacée FSRS par notion

## 1. Objectif

Intégration ts-fsrs : création de carte, application d'une note, note déduite de la justesse et du temps (médiane par format), auto-évaluation de la carte de rappel, prévisualisation des échéances par note, rétention visée paramétrable. La livraison est vérifiable par les contrats, les états d’interface et les critères de la section 11.

## 2. Contexte

Lire `docs/product/business-rules.md` (BR-MEM-01, BR-MEM-02), `docs/architecture/overview.md` §1 et §3, `docs/architecture/data-model.md` §5–§7, `docs/engineering/conventions.md` §2, §6 et §7, `docs/engineering/testing.md` et SPEC-401. ADR applicables : ADR-0025. Le moteur calcule sans accès réseau, base, horloge système ou fournisseur IA ; les services de SPEC-411 persisteront ses sorties.

## 3. Dépendances

- **SPEC-401** — types de carte, horloge et frontières du paquet pur.
- Les algorithmes reçoivent dates, fuseau et paramètres en entrée et renvoient des données typées sans effet de bord. Les services lisent les bornes dans `packages/config/src/product.ts` et les transmettent au moteur ; les démonstrations utilisent l’horloge figée.

## 4. Règles métier couvertes

- **BR-MEM-01** — Répétition espacée par **notion** avec FSRS (bibliothèque `ts-fsrs`) ; taux de mémorisation visé 90 % par défaut (réglable 85/90/95 %, automatisme 7).
- **BR-MEM-02** — La note FSRS est déduite de la justesse et du temps de réponse (aucune confiance demandée) : faux → Again ; juste et temps > 2× le temps médian de l'apprenant pour ce format → Hard ; juste → Good ; juste et temps < 0,5× la médiane → Easy. La carte de rappel garde l'auto-évaluation (Raté/Difficile/Bon/Facile → Again/Hard/Good/Easy), avec l'échéance affichée sous chaque bouton.

## 5. Exigences fonctionnelles

- **EF-1** — Créer une seule carte FSRS par couple utilisateur/notion ; la rétention demandée est 0,90 par défaut et peut être 0,85, 0,90 ou 0,95 selon le réglage de l’automatisme 7.
- **EF-2** — Pour une réponse fausse, déduire Again ; pour une réponse juste plus lente que deux fois la médiane personnelle du format, Hard ; pour une réponse juste plus rapide que la moitié de cette médiane, Easy ; sinon Good.
- **EF-3** — Calculer la médiane sur les 50 dernières réponses de l’apprenant pour le format ; avec moins de cinq réponses, utiliser 20 s. Le temps mesuré ne devient jamais une auto-évaluation demandée à l’apprenant.
- **EF-4** — Pour une carte de rappel, conserver l’auto-évaluation Raté, Difficile, Bon, Facile mappée respectivement sur Again, Hard, Good, Easy et afficher avant choix l’échéance simulée de chacune.
- **EF-5** — Appliquer la note à la carte courante par `ts-fsrs`, retourner carte suivante et date due, sans persistance ni appel IA dans le moteur.

## 6. Exigences techniques

- **ET-1** — `createNotionCard(now, retention)` instancie une carte `ts-fsrs` à l’instant fourni ; `gradeReview(input)` retourne `again|hard|good|easy` à partir de `correct`, `timeMs`, `format`, historique et auto-évaluation facultative.
- **ET-2** — `applyReview(card, grade, now, retention)` retourne la nouvelle carte et `dueAt`; `previewGrades(card, now, retention)` retourne les quatre dates sans modifier la carte.
- **ET-3** — Le calcul de médiane trie une copie des 50 temps valides les plus récents par format ; 0, valeurs négatives ou manquantes sont exclues. Les dates sont ISO UTC dans les sorties.
- **ET-4** — La fonction du moteur prend un objet d’entrée explicite et retourne un résultat déterministe ; aucune lecture SQL, `fetch`, SDK IA, `Date.now()` ou `new Date()` sans argument n’est autorisée dans `packages/learning-engine`.
- **ET-5** — Exposer les types et fonctions par l’API publique du paquet ; valider les bornes à la frontière du service. Les calculs de temps prennent le fuseau, l’instant et les paramètres configurés comme entrées, puis couvrent les changements d’heure et les ordres d’entrée différents.

## 7. Comportements attendus et cas limites

- **CL-1** — Aucun historique : médiane 20 s et note Good pour une réponse juste de 20 s.
- **CL-2** — Temps exactement 0,5× ou 2× la médiane : les comparaisons sont strictes, donc Good.
- **CL-3** — Réponse fausse très rapide : Again prévaut toujours sur la durée.
- **CL-4** — Carte de rappel sans choix : réponse incomplète, aucune mise à jour.
- **CL-5** — Deux appels avec même carte, note et instant : résultats identiques ; l’entrée n’est pas mutée.

## 8. Instructions d'implémentation

1. Écrire les types d’entrée/sortie et la fonction pure dans `packages/learning-engine/src/fsrs/review.ts`, avec paramètres métier fournis par l’appelant et ordre stable des collections. Commit `feat(SPEC-402): ajoute le calcul déterministe`.
2. Couvrir tous les cas limites de la section 7 par des tests unitaires, y compris exemples chiffrés, propriétés de bornes et répétabilité. Commit `test(SPEC-402): vérifie les invariants du moteur`.
3. Brancher l’API publique du paquet et la page `/_dev/sdd/SPEC-402` ; elle montre les entrées et sorties réellement calculées, sans écriture en base.
4. Ajouter test d’intégration de la composition avec les fonctions déjà livrées, e2e filmé et test visuel de la démonstration.
5. Exécuter `validate.mjs SPEC-402`, consigner les preuves réelles puis `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/learning-engine/src/fsrs/review.ts`, `packages/learning-engine/src/fsrs/review.test.ts`, `packages/learning-engine/src/fsrs/median.ts`, `packages/learning-engine/test/integration/fsrs.test.ts`, `apps/web/components/sdd-demos/spec-402.tsx`, `apps/web/e2e/specs/p4/spec-402.spec.ts`.
- **Modifiés** : `packages/learning-engine/src/index.ts`, `packages/config/src/product.ts` seulement si une constante normative manque, registre de démonstration SDD.
- **Lus / réutilisés** : `@learny/core`, `@learny/testing`, `ts-fsrs` pour SPEC-402, sorties des dépendances ; dépendances SPEC-401.

## 10. Interface et conformité visuelle

Mode `demo`. Page SDD : une notion fictive, son historique de temps, la note calculée, les quatre boutons Raté/Difficile/Bon/Facile et leurs dates dues. Les dates sont formatées dans le fuseau de démonstration ; le résultat est issu de la fonction pure. Page `/_dev/sdd/SPEC-402` : afficher les données d’entrée, chaque étape utile et le résultat réellement calculé par le moteur, avec un cas limite visible. Mode `demo` : vérifier jetons, ordre des régions, axe, capture desktop/mobile et `toHaveScreenshot` à 1 %. Aucune maquette métier ne s’applique.

## 11. Critères d'acceptation

- **CA-1** — Pour une médiane de 20 s, faux → Again, juste 9 s → Easy, 20 s → Good, 41 s → Hard ; les frontières 10 s et 40 s donnent Good.
- **CA-2** — La médiane ignore les réponses invalides, prend au plus 50 entrées du même format et vaut 20 s avant cinq réponses valides.
- **CA-3** — Les quatre boutons de carte de rappel affichent une échéance calculée par `ts-fsrs` et leur choix produit la note correspondante.
- **CA-4** — Une carte par notion et une rétention de 0,85/0,90/0,95 produisent des échéances reproductibles sans mutation de l’entrée.
- **CA-5** — La démonstration filmée et son test `@visual` affichent les quatre échéances, passent axe et la capture de non-régression.

## 12. Plan de tests

- **Unitaires** — `packages/learning-engine/src/fsrs/review.test.ts`, `describe('[SPEC-402] Répétition espacée FSRS par notion')` : notes déduites et médiane personnelle, cas limites et propriétés de la section 7 (CA-1 à CA-4).
- **Intégration** — `packages/learning-engine/test/integration/fsrs.test.ts`, `describe('[SPEC-402] composition')` : application puis prévisualisation avec même carte et instant, entrée/sortie avec les dépendances et invariance à la répétition (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p4/spec-402.spec.ts`, `test('Répétition espacée FSRS par notion @SPEC-402')` : choix de carte de rappel et quatre échéances dans la démonstration ; conserver vidéo et capture (CA-1, CA-5).
- **Visuel** — `test('Répétition espacée FSRS par notion @SPEC-402 @visual')` : jetons, structure, axe, capture desktop/mobile à 1 % (CA-5).
- **Non-régression** — rejouer les étiquettes `[SPEC-401]` / `@SPEC-401`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; e2e |
| CA-2 | unitaires ; intégration |
| CA-3 | unitaires ; intégration |
| CA-4 | unitaires ; intégration |
| CA-5 | e2e ; @visual |

## 13. Preuves attendues

`evidence/SPEC-402/` contient `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, une vidéo réelle du scénario `@SPEC-402`, captures desktop/mobile, comparaisons visuelles applicables et `acceptance.md` reliant chaque CA au test et à sa sortie. Aucune capture ou réussite n’est déclarée sans fichier effectivement généré.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 est remplie : lint, typecheck, build, tests unitaires et d’intégration filtrés, e2e avec vidéo, au moins un test `@visual`, axe, preuves et absence de régression. La fonction pure reste déterministe à entrée identique, sans I/O, base, IA ni import de `packages/config` ; les services lui transmettent les paramètres métier.

## 15. Décisions et hypothèses

Décisions appliquées : ADR-0025. Les valeurs normatives viennent des règles métier et de la maquette ; aucune valeur produit n’est introduite hors du catalogue. Toute ambiguïté d’implémentation découverte ensuite suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification de la spécification.
