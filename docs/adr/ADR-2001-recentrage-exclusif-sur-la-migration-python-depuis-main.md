# ADR-2001 — Recentrage exclusif sur la migration Python depuis main

- **Statut** : Acceptée
- **Origine** : Validée (décision du porteur du projet)
- **Date** : 2026-11-21
- **Liens** : ADR-1001, ADR-1002, ADR-1006, SPEC-2001

## Contexte

Le porteur du projet a ordonné le 21 novembre 2026 de ne plus poursuivre aucune autre spécification et de se concentrer uniquement sur la migration du backend vers Python. Deux trajectoires coexistaient : la piste `produit` (P7 → P9 en cours, CP-7 et CP-8 non passés) et la piste `migration` Hono (ADR-1002, ADR-1006, branche `migration` arrêtée après SPEC-1001). La première version de la spécification Python (SPEC-MIGRATION) attendait CP-8 et ne pouvait donc jamais démarrer.

## Décision

1. La branche `main` au commit 68d0d3c4 est l'état de départ de la migration Python : le web Next.js y est déjà un client pur de l'API (`tools/migration/report.mjs --check`) et l'API Hono `apps/api` monte 217 opérations.
2. La piste `python-migration` (phases P20 → P23, SPEC-2001 → SPEC-2302, checkpoints CP-20 → CP-23, ADR-2001 → ADR-2999) est l'**unique piste active** (`activeTrack`). Elle part de `main`, fusionne dans `main` et ne dépend d'aucun checkpoint d'une autre piste.
3. Les specs en attente des pistes `produit` (SPEC-808, SPEC-901 → 908, CP-7 → CP-9) et `migration` Hono (SPEC-1101 → SPEC-1302, CP-10 → CP-13) sont **gelées** : conservées dans le catalogue, l'état et l'historique, jamais démarrées ni supprimées. Leur reprise exigera un nouvel ADR.
4. La branche `migration` et le worktree `learny-wt-migration` sont archivés tels quels ; aucun commit n'y est ajouté.
5. ADR-1002 cesse d'être la cible d'architecture : Hono reste le runtime **transitoire** des routes non encore migrées jusqu'au retrait prouvé (SPEC-2302). ADR-1006 ne s'applique plus qu'à l'historique de la piste Hono.
6. L'invariant d'ADR-1001 (aucun changement fonctionnel visible) reste normatif ; ADR-2008 précise son application aux tests portés en Python.

## Conséquences

`next.mjs` pilote uniquement la piste python-migration. Les règles métier `BR-*`, les maquettes et les comportements livrés restent normatifs. La V1/V2 produit ne progresse plus tant que ce recentrage est en vigueur.
