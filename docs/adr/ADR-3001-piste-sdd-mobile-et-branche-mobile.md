# ADR-3001 — Piste SDD « mobile » sur la branche `mobile`

- **Statut** : Acceptée — complète ADR-1004 et ADR-1006
- **Origine** : Validée (décision prise avec le porteur du projet, 2026-11-22)
- **Date** : 2026-11-22
- **Liens** : ADR-1004, ADR-1006, ADR-2001, ADR-3002, SPEC-3001

## Contexte

ADR-1004 a retenu React Native + Expo pour les applications Android et iOS et renvoyait leurs
spécifications après la piste de migration Hono (CP-13), aujourd'hui gelée par ADR-2001. La piste
active sur `main` est `python-migration` (P20 → P23). Le porteur du projet souhaite développer
l'application mobile **en parallèle**, sur une branche partant de l'état de `main` au 2026-11-22
(commit `4cd450d0`), sans attendre la fin de la migration Python.

ADR-1006 fournit déjà le mécanisme : pistes indépendantes, branche de base par piste, plage d'ADR
par piste, fusion de `main` par `tools/sdd/sync-main.mjs`.

## Décision

1. Nouvelle piste `mobile` déclarée dans `specs/catalog.json` : `baseBranch: "mobile"`,
   `versionTags: false`, `adrBase: 3000`. Sur la branche `mobile`, `activeTrack` vaut `"mobile"`.
2. Phases P30 → P35, spécifications `SPEC-30xx` → `SPEC-35xx` (phase × 100 + rang), checkpoints
   CP-30 → CP-35, priorité `mobile`. Dossiers `specs/p30-mobile-…` à `specs/p35-mobile-…`.
3. Les branches de spécification `spec/SPEC-3xxx-…` partent de `mobile` et y sont fusionnées
   (`--no-ff`) par `complete.mjs`. Aucun tag SemVer ; tags `cp-3x` seulement.
4. **Une seule écriture par zone** (pas de double écrivain avec la piste `python-migration`) :
   la piste mobile n'écrit que dans `apps/mobile/`, `docs/architecture/mobile/`, `specs/p3x-…`,
   `evidence/SPEC-3xxx/`, `tools/sdd/` (extensions rétrocompatibles) et les paquets partagés
   clients listés par ADR-3005 (ajouts rétrocompatibles uniquement). Elle ne modifie ni
   `apps/api`, ni `apps/api-py`, ni `apps/worker-py`, ni le contrat d'API, **sauf** en phase P35,
   qui exige CP-23 (`requires: ["CP-23"]`) : le backend est alors entièrement Python.
5. `main` est fusionnée dans `mobile` au moins à chaque checkpoint mobile et après chaque
   checkpoint de la piste Python (`node tools/sdd/sync-main.mjs`). Les conflits de suivi se
   résolvent selon ADR-1006 §4.
6. Fin de piste : après CP-35, `mobile` est fusionnée dans `main` (`--no-ff`) et `activeTrack`
   est remis à la piste alors active sur `main`, dans le commit de fusion uniquement.
7. L'invariant de la piste Python (ADR-1001, ADR-2008) s'applique au web : la piste mobile ne
   modifie aucun écran, libellé, oracle ou ligne de base du web.

## Conséquences

- `next.mjs` sur `mobile` pilote la piste mobile ; `SDD_TRACK=python-migration` reste utilisable
  pour consulter l'autre piste.
- Les spécifications P30 à P34 ne dépendent que du contrat `/api/v1` existant, stable pendant la
  migration (ADR-2004) ; elles se testent contre l'API locale (Hono ou façade Python).
- P35 (notifications push natives, publication) attend CP-23.
