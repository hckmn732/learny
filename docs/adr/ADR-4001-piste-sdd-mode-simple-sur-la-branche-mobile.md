# ADR-4001 — Piste SDD « mode-simple » sur la branche `mobile`

- **Statut** : Acceptée — §2 et §4 remplacés par ADR-4004 (branche unique `main`)
- **Origine** : Validée (décision du porteur du projet, 2026-11-24)
- **Date** : 2026-11-24
- **Liens** : ADR-1006, ADR-3001, ADR-4002, ADR-4003, SPEC-4001, SPEC-4002, SPEC-4003

## Contexte

Le porteur du projet ajoute un second mode de création de formation, le **mode simple** : l'apprenant dépose son cours et Learny en fait une formation complète (`docs/product/mode-simple.md`, maquettes `design/mode-simple/`). Ce mode touche trois zones à la fois : le backend Python (`apps/api`, `apps/worker`, `python/learny`), le web (`apps/web`) et l'application mobile (`apps/mobile`). Le porteur exige qu'il soit livré **en même temps** sur le web et sur le mobile (ADR-4002).

Or les pistes existantes sont cloisonnées. La piste `python-migration` est close (CP-23 franchi). La piste `produit` est gelée. La piste `mobile` n'écrit que dans `apps/mobile/` (ADR-3001 §4). Enfin, l'application mobile n'existe que sur la branche `mobile`, qui contient déjà tout `main`.

## Décision

1. Une piste **`mode-simple`** est ajoutée au catalogue (`specs/catalog.json`) : `baseBranch` `mobile`, `versionTags` `false`, `adrBase` `4000`. Ses ADR sont numérotés à partir d'ADR-4001, ses spécifications à partir de SPEC-4001, ses phases à partir de P40 et ses checkpoints à partir de CP-40.
2. La branche de base est **`mobile`**, la seule qui porte ensemble le backend, le web et l'application mobile. Les branches `spec/SPEC-40xx-…` partent de `mobile` et y sont fusionnées (`--no-ff`). La piste suit ensuite la fusion de `mobile` dans `main` prévue après CP-35 (ADR-3001 §6).
3. La piste écrit dans les zones de son périmètre : `python/learny`, `apps/api`, `apps/worker`, `apps/web`, `apps/mobile`, `packages/contracts`, `packages/db`, `packages/i18n`, `packages/api-client`, `packages/api-sdk` et les fichiers générés du contrat. La règle « un seul écrivain par zone » reste en vigueur : une spécification de la piste mobile et une spécification de la piste `mode-simple` ne tournent jamais en parallèle sur les mêmes fichiers.
4. L'outillage est inchangé. Les commandes se lancent avec `SDD_TRACK=mode-simple` (par exemple `SDD_TRACK=mode-simple node tools/sdd/next.mjs`) tant que `activeTrack` reste `mobile` sur la branche `mobile`.
5. La phase **P40** livre le lot 1 du mode simple : SPEC-4001 (backend et contrat), puis SPEC-4002 (web) et SPEC-4003 (mobile). SPEC-4002 et SPEC-4003 dépendent de SPEC-4001 et peuvent tourner en parallèle, chacune dans son worktree. Le checkpoint CP-40 exige que les deux parcours soient prouvés de bout en bout.

## Conséquences

- La piste `mobile` garde sa numérotation (ADR-30xx, SPEC-3xxx) ; aucune collision de numéros.
- La fusion de `mobile` dans `main` emporte le mode simple ; aucune fusion séparée n'est nécessaire.
- Les checkpoints de la piste mobile et ceux de la piste `mode-simple` restent indépendants.
