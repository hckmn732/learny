# CP-23 — fin de la piste python-migration

- **Statut** : franchi par exception, sur décision du porteur du projet (2026-11-24).
- **Commit** : `e647d1db` (`main`).
- **Livré** : backend 100 % Python (ADR-2043). `apps/api-py` sert les 156 opérations et les 11 routes spéciales, `apps/worker-py` les 23 consommateurs et les 2 crons. Le backend TypeScript, Inngest et `api/ownership.yaml` sont retirés.
- **Specs** : SPEC-2301 et SPEC-2302 marquées `done` sur la même décision.

## Ce qui n'est pas prouvé

- SPEC-2301 : charge, canary, rollback et restauration sur le staging Coolify non mesurés (CA-1 à CA-4). Le staging n'a pas été fourni (ADR-2009). Seules les preuves locales existent (`evidence/SPEC-2301/`).
- SPEC-2302 : pas de campagne `validate.mjs` complète (e2e, visuel). Les blocages relevés en cours de route sont dans `evidence/SPEC-2302/blockers.md`.
- Passerelle LLM réelle : le démarrage exige `LLM_MODE=mock` (point ouvert d'ADR-2042).

Le rapport précédent (« non franchi », 2026-11-23) reste consultable dans l historique : `git show e647d1db:evidence/checkpoints/CP-23/summary.md`.
