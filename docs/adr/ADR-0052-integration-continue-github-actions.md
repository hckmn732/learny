# ADR-0052 — Intégration continue GitHub Actions

- **Statut** : Acceptée
- **Origine** : Confirmée par le porteur du projet (dépôt GitHub `hckmn732/learny` communiqué le 2026-11-11)
- **Date** : 2026-11-11
- **Liens** : SPEC-011, SPEC-013, ADR-0051

## Contexte

Le dépôt distant est hébergé sur GitHub : `https://github.com/hckmn732/learny.git`. Il est créé et connecté par le porteur du projet ; aucun agent ne crée de dépôt distant ni ne modifie les remotes.

## Décision

- Intégration continue sur GitHub Actions, workflows dans `.github/workflows/`. Le workflow initial `ci.yml` (préparé avec le référentiel) exécute toujours l'audit SDD et la recherche de secrets ; les jobs applicatifs (lint, typecheck, build, unitaires, intégration avec Supabase local, e2e Chromium et conformité visuelle) s'activent dès que `pnpm-lock.yaml` existe (SPEC-001). SPEC-011 le complète (actionlint, cache, matrice cross-browser aux checkpoints, publication des preuves en artefacts) et SPEC-013 ajoute le déploiement continu.
- Les actions tierces sont épinglées sur une version majeure (`@v4`, `@v2`, `@v1`) ; SPEC-011 peut les épingler par empreinte.
- La protection de la branche `main` (CI verte obligatoire, pas de push forcé) est activée par le porteur du projet sur GitHub ; la procédure est décrite dans `CONTRIBUTING.md`.

## Conséquences

- Les secrets de CI (clés de services gérés) sont ajoutés par le porteur du projet dans les paramètres du dépôt ; leur absence est un blocage externe documenté (SPEC-013), jamais contourné.
- Les tests de CI tournent en modes simulés (`LLM_MODE=mock`, `STRIPE_MODE=mock`, `EMAIL_MODE=memory`, `PUSH_MODE=mock`) et horloge figée.
