# 15 — Backlog d'implémentation

Le backlog est porté par les spécifications SPEC-2001 → SPEC-2302 de la piste `python-migration` (voir [12 — Feuille de route SDD](12-feuille-de-route-sdd.md) et `specs/catalog.json`).

| Priorité | Spécification | Travail | Sortie exigée |
|---|---|---|---|
| P0 | SPEC-2001 | Inventaire des 217 opérations, SSE, webhooks, événements, tâches ; oracles ; carte de portage des tests | Base de référence rejouable |
| P1 | SPEC-2002, SPEC-2003 | Contrat OpenAPI source et SDK ; workspace uv, FastAPI, CI, Docker, façade | Tout le trafic via Python sans changement |
| P1 | SPEC-2101, SPEC-2102 | PostgreSQL, JWT, RLS, Storage ; outbox et worker | Matrice RLS et tests de crash verts |
| P2 | SPEC-2201 → SPEC-2207 | Domaines dans l'ordre identité/formation, apprentissage/évaluations, contenu, tuteur, engagement, facturation/confidentialité | Parité sans divergence, entrées à `py` |
| P3 | SPEC-2301 | Coolify, canary, rollback, restauration, charge sur staging | Preuves mesurées sur staging |
| P3 | SPEC-2302 | Non-régression complète, retrait de Hono, Inngest et paquets backend | Inventaire final sans TypeScript backend |

## Gates avant bascule en production

- Toutes les entrées à `py` en local avec parité prouvée (CP-22).
- OpenAPI et SDK validés par la CI.
- Aucune bascule si la parité, les tests d'accès, l'observabilité, le rollback ou la restauration ne sont pas prouvés sur le staging (ADR-2009).

La création de ce backlog n'exécute aucun test et ne certifie aucun résultat de migration.
