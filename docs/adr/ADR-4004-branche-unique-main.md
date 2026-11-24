# ADR-4004 — Branche unique `main`

- **Statut** : Acceptée — remplace ADR-3001 §1 (branche de base), §3, §5 et §6, et ADR-4001 §2 et §4
- **Origine** : Validée (décision du porteur du projet, 2026-11-24)
- **Date** : 2026-11-24
- **Liens** : ADR-1006, ADR-3001, ADR-4001, ADR-4002

## Contexte

Le 2026-11-24, trois branches vivantes portaient le travail :
- `main` : backend 100 % Python et web ;
- `mobile` : application mobile, plus `main` synchronisée régulièrement ;
- `feat/mode-simple` : conception du mode simple, plus `mobile`.

Chaque changement de `main` devait être reporté dans `mobile` par `sync-main.mjs`, avec des conflits répétés sur le suivi et l'index des ADR. Or le mobile doit désormais être iso web (ADR-4002), ce qui fait de chaque fonctionnalité un changement commun au backend, au web et au mobile. Le porteur demande **une seule branche à jour**, point de départ de tous les développements futurs.

## Décision

1. `feat/mode-simple`, qui contenait `mobile` et `main`, est fusionnée dans `main` (`--no-ff`). `main` porte désormais le backend, le web, l'application mobile et la conception du mode simple.
2. **`main` est l'unique branche de base** de toutes les pistes : `tracks.mobile.baseBranch` et `tracks.mode-simple.baseBranch` valent `main`. Les branches `spec/SPEC-xxxx-…` partent de `main` et y sont fusionnées (`--no-ff`) par `complete.mjs`.
3. Les branches `mobile` et `feat/mode-simple` sont supprimées, en local et sur `origin`, une fois leur contenu vérifié dans `main`. La branche archivée `migration` reste en l'état (piste gelée).
4. `sync-main.mjs` n'a plus d'usage courant. Il reste dans l'outillage pour une éventuelle branche de longue durée, qui exigerait un nouvel ADR.
5. `activeTrack` vaut `mode-simple`. Les autres pistes ouvertes se pilotent avec `SDD_TRACK=<piste>`, par exemple `SDD_TRACK=mobile node tools/sdd/next.mjs` pour P35.
6. La règle « un seul écrivain par zone » se vérifie désormais entre **spécifications** et non plus entre branches : deux spécifications qui touchent les mêmes fichiers ne tournent pas en parallèle (par exemple SPEC-3501 et SPEC-4001 sur le worker Python).

## Conséquences

- La fusion de `mobile` dans `main`, prévue après CP-35 (ADR-3001 §6), est faite par anticipation. CP-35 n'emporte plus de fusion.
- Les tags `cp-3x` et `cp-4x` sont posés sur `main`.
- `AGENTS.md`, `docs/engineering/git.md` et `specs/checkpoints.md` sont mis à jour en conséquence.
