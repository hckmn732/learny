---
id: SPEC-408
title: "Rétention et indicateurs de progression"
phase: P4
priority: V1
depends_on: [SPEC-402]
business_rules: [BR-MEM-06, BR-PRO-01]
screens: []
adrs: [ADR-0210, ADR-0283]
visual: demo
---

# SPEC-408 — Rétention et indicateurs de progression

## 1. Objectif

Rétention à 30 et 60 jours (fenêtres ± 3 j), avancement des formations, heures prévues/faites, notions maîtrisées. La livraison est vérifiable par les contrats, les états d’interface et les critères de la section 11.

## 2. Contexte

Lire `docs/product/business-rules.md` (BR-MEM-06, BR-PRO-01), `docs/architecture/overview.md` §1 et §3, `docs/architecture/data-model.md` §5–§7, `docs/engineering/conventions.md` §2, §6 et §7, `docs/engineering/testing.md` et SPEC-401. Le moteur calcule sans accès réseau, base, horloge système ou fournisseur IA ; les services de SPEC-411 persisteront ses sorties.

## 3. Dépendances

- **SPEC-402** — journaux de révision datés par notion.
- Les algorithmes reçoivent dates, fuseau et paramètres en entrée et renvoient des données typées sans effet de bord. Les services lisent les bornes dans `packages/config/src/product.ts` et les transmettent au moteur ; les démonstrations utilisent l’horloge figée.

## 4. Règles métier couvertes

- **BR-MEM-06** — Indicateur de rétention : part des notions réussies parmi celles revues 30 jours (± 3) et 60 jours (± 3) après la validation de leur module ; affiché à 1 mois et 2 mois.
- **BR-PRO-01** — Avancement d'une formation = modules validés / modules total (en %).

## 5. Exigences fonctionnelles

- **EF-1** — Calculer la rétention à 30 et 60 jours après validation de chaque module : part des notions réussies parmi celles revues dans les fenêtres respectives de ± 3 jours.
- **EF-2** — Afficher une valeur absente lorsque aucune notion n’a été revue dans une fenêtre, plutôt qu’un 0 % trompeur ; chaque notion compte une seule fois par fenêtre, par sa révision pertinente.
- **EF-3** — Calculer l’avancement d’une formation comme modules validés divisés par modules total, en pourcentage borné 0–100 ; sans module, avancement 0 et statut explicite.
- **EF-4** — Calculer heures prévues et heures faites à partir des créneaux, sans compter un créneau annulé comme accompli ; déduire notions maîtrisées depuis `mastery ≥ 80`.
- **EF-5** — Retourner des agrégats par formation et par apprenant, sans mélanger les métriques privées de deux membres d’un groupe.

## 6. Exigences techniques

- **ET-1** — `calculateRetention({ modules, reviews, at })` retourne pour chaque horizon `{ eligible, reviewed, successful, rate|null }`; la fenêtre 30 j est [27,33] jours et celle de 60 j [57,63] jours après `validatedAt`.
- **ET-2** — `calculateProgress({ modules, slots, notionStates })` retourne `validatedModules`, `totalModules`, `progressPercent`, `plannedMinutes`, `completedMinutes`, `masteredNotions`.
- **ET-3** — Trier et dédupliquer les révisions par couple notion/horizon ; les données sont filtrées par `userId` dans le service appelant, jamais par le moteur à partir d’un état global.
- **ET-4** — La fonction du moteur prend un objet d’entrée explicite et retourne un résultat déterministe ; aucune lecture SQL, `fetch`, SDK IA, `Date.now()` ou `new Date()` sans argument n’est autorisée dans `packages/learning-engine`.
- **ET-5** — Exposer les types et fonctions par l’API publique du paquet ; valider les bornes à la frontière du service. Les calculs de temps prennent le fuseau, l’instant et les paramètres configurés comme entrées, puis couvrent les changements d’heure et les ordres d’entrée différents.

## 7. Comportements attendus et cas limites

- **CL-1** — Aucune révision dans la fenêtre : `rate=null`, non 0.
- **CL-2** — Révision exactement à J+27 ou J+33 : incluse ; à J+26 ou J+34 : exclue.
- **CL-3** — Plusieurs révisions d’une notion dans la fenêtre : une contribution, règle déterministe de sélection.
- **CL-4** — Formation sans module : 0 % sans division par zéro.
- **CL-5** — Créneau déplacé : l’ancien ne compte pas deux fois dans le volume prévu.

## 8. Instructions d'implémentation

1. Écrire les types d’entrée/sortie et la fonction pure dans `packages/learning-engine/src/metrics/retention.ts`, avec paramètres métier fournis par l’appelant et ordre stable des collections. Commit `feat(SPEC-408): ajoute le calcul déterministe`.
2. Couvrir tous les cas limites de la section 7 par des tests unitaires, y compris exemples chiffrés, propriétés de bornes et répétabilité. Commit `test(SPEC-408): vérifie les invariants du moteur`.
3. Brancher l’API publique du paquet et la page `/_dev/sdd/SPEC-408` ; elle montre les entrées et sorties réellement calculées, sans écriture en base.
4. Ajouter test d’intégration de la composition avec les fonctions déjà livrées, e2e filmé et test visuel de la démonstration.
5. Exécuter `validate.mjs SPEC-408`, consigner les preuves réelles puis `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/learning-engine/src/metrics/retention.ts`, `packages/learning-engine/src/metrics/progress.ts`, `packages/learning-engine/src/metrics/retention.test.ts`, `packages/learning-engine/test/integration/metrics.test.ts`, `apps/web/components/sdd-demos/spec-408.tsx`, `apps/web/e2e/specs/p4/spec-408.spec.ts`.
- **Modifiés** : `packages/learning-engine/src/index.ts`, `packages/config/src/product.ts` seulement si une constante normative manque, registre de démonstration SDD.
- **Lus / réutilisés** : `@learny/core`, `@learny/testing`, `ts-fsrs` pour SPEC-402, sorties des dépendances ; dépendances SPEC-402.

## 10. Interface et conformité visuelle

Mode `demo`. Page SDD : deux indicateurs de rétention avec numérateur/dénominateur et une barre d’avancement ; état « Pas encore mesurable » distinct de 0 %. Données issues de la fonction pure. Page `/_dev/sdd/SPEC-408` : afficher les données d’entrée, chaque étape utile et le résultat réellement calculé par le moteur, avec un cas limite visible. Mode `demo` : vérifier jetons, ordre des régions, axe, capture desktop/mobile et `toHaveScreenshot` à 1 %. Aucune maquette métier ne s’applique.

## 11. Critères d'acceptation

- **CA-1** — Avec 8 notions revues à J+30 ± 3 dont 6 réussies, la rétention à un mois vaut 75 % ; hors fenêtre, la révision n’entre pas au dénominateur.
- **CA-2** — Sans révision admissible, la rétention vaut null et l’interface peut afficher « Pas encore mesurable ».
- **CA-3** — Trois modules validés sur sept donnent 42,857… % avant arrondi d’affichage ; le nombre de notions maîtrisées suit le seuil 80 %.
- **CA-4** — Les heures faites excluent les créneaux annulés/manqués et ne doublent pas un déplacement.
- **CA-5** — La page SDD affiche horizons, dénominateurs et progression calculés, avec vidéo, axe et test `@visual`.

## 12. Plan de tests

- **Unitaires** — `packages/learning-engine/src/metrics/retention.test.ts`, `describe('[SPEC-408] Rétention et indicateurs de progression')` : fenêtres 27–33 et 57–63 jours, déduplication, cas limites et propriétés de la section 7 (CA-1 à CA-4).
- **Intégration** — `packages/learning-engine/test/integration/metrics.test.ts`, `describe('[SPEC-408] composition')` : composition avec modules, créneaux et états de notions, entrée/sortie avec les dépendances et invariance à la répétition (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p4/spec-408.spec.ts`, `test('Rétention et indicateurs de progression @SPEC-408')` : lecture des trois indicateurs et état non mesurable dans la démonstration ; conserver vidéo et capture (CA-1, CA-5).
- **Visuel** — `test('Rétention et indicateurs de progression @SPEC-408 @visual')` : jetons, structure, axe, capture desktop/mobile à 1 % (CA-5).
- **Non-régression** — rejouer les étiquettes `[SPEC-402]` / `@SPEC-402`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; e2e |
| CA-2 | unitaires ; intégration |
| CA-3 | unitaires ; intégration |
| CA-4 | unitaires ; intégration |
| CA-5 | e2e ; @visual |

## 13. Preuves attendues

`evidence/SPEC-408/` contient `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, une vidéo réelle du scénario `@SPEC-408`, captures desktop/mobile, comparaisons visuelles applicables et `acceptance.md` reliant chaque CA au test et à sa sortie. Aucune capture ou réussite n’est déclarée sans fichier effectivement généré.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 est remplie : lint, typecheck, build, tests unitaires et d’intégration filtrés, e2e avec vidéo, au moins un test `@visual`, axe, preuves et absence de régression. La fonction pure reste déterministe à entrée identique, sans I/O, base, IA ni import de `packages/config` ; les services lui transmettent les paramètres métier.

## 15. Décisions et hypothèses

Les valeurs normatives viennent des règles métier et de la maquette ; aucune valeur produit n’est introduite hors du catalogue. Toute ambiguïté d’implémentation découverte ensuite suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification de la spécification. **ADR-0210** fixe la sélection de la première révision d’une notion dans une fenêtre ; **ADR-0283** consigne les compléments d’implémentation : unité du taux, sens de `eligible`, lignes dupliquées, créneaux déplacés et frontière apprenant/formation.
