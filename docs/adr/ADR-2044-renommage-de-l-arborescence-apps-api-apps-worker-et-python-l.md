# ADR-2044 — Renommage de l arborescence apps/api, apps/worker et python/learny

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-24
- **Liens** : ADR-2043, SPEC-2302

## Contexte

Le backend TypeScript a disparu (ADR-2043) : les suffixes -py de apps/api-py et apps/worker-py, ainsi que le repertoire packages-py, ne distinguaient plus rien et racontaient une coexistence terminee. Le renommage est purement structurel : aucun contrat, aucune route et aucun libelle ne changent.

## Décision

apps/api-py devient apps/api, apps/worker-py devient apps/worker, packages-py devient python (la bibliotheque reste python/learny), et docker/api-py.Dockerfile devient docker/api.Dockerfile. Le workspace uv, pyproject, les scripts pnpm, les Dockerfiles, les composes, la CI, les outils et la documentation de reference pointent sur les nouveaux chemins ; uv.lock et api/inventory.json sont regeneres. Les ADR anterieures a ADR-2044 et les preuves de evidence/ gardent les anciens chemins : ce sont des enregistrements dates, pas de la documentation vivante.

## Conséquences

Arborescence lisible sans residu de migration. Les identifiants de deploiement (services Compose api-py et worker-py, variables PY_*) sont conserves : les renommer casserait la pile Coolify deja deployee et ne releve pas de ce changement. Les noms de modules Python (learny_api, learny_worker) sont inchanges.
