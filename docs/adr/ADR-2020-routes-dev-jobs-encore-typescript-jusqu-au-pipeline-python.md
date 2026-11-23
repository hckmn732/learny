# ADR-2020 — Routes dev-jobs encore TypeScript jusqu au pipeline Python

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-21
- **Liens** : SPEC-2102, SPEC-2003, ADR-2005, ADR-2011, ADR-2014

## Contexte

SPEC-2102 EF-5 demande de basculer les 4 routes dev-jobs et le consommateur de demonstration a py. Le consommateur bascule (api/ownership.yaml consumers, filtre par le worker, CA-3). Les 4 routes sont des routes speciales du contrat (packages/contracts/src/dev-jobs.ts, manifeste special) servies jusqu ici par le pipeline generique TypeScript. La facade Python ne possede aucun pipeline de contrat : apps/api-py/src/learny_api ne contient ni pipeline.py, ni generated/routes.py, ni generated/models.py, qui figurent pourtant dans la disposition de 00-conventions section 2 comme livrables de SPEC-2003 (le log de validation de SPEC-2003 montre que seule la facade avec relais a ete livree). Servir ces 4 routes en Python sans ces artefacts obligerait a reecrire a la main des DTO que le contrat declare, ce qu interdit ADR-2011, et la route du tick horaire exige de porter selectTickUsers/buildLocalTick (fenetres locales, fuseaux, pagination) sans aucun gain de parite mesurable a ce stade.

## Décision

Les 4 routes dev-jobs restent ts dans api/ownership.yaml ; le consommateur de demonstration passe a py et le worker est prouve de bout en bout avec la route TypeScript comme producteur (e2e @SPEC-2102 : 202, livraison devtools.demo_job done en un essai, dispatched_at estampille). La bascule des routes et le rejeu pnpm parity:check --group dev-jobs se feront avec le pipeline de contrat Python (generated/routes.py et generated/models.py), avant que SPEC-2207 ne deplace les consommateurs metier. Le runbook (docs/engineering/outbox-runbook.md) et les tests de crash, concurrence, duplication et planificateur singleton restent la preuve de CA-1, CA-2 et CA-3.

## Conséquences

SPEC-2102 est done sur ses criteres d acceptation ; EF-5 est satisfait cote consommateur seulement. Une spec ulterieure doit livrer le pipeline de contrat Python et basculer les 4 routes, sinon l etat de sortie de P21 (seules les 4 routes dev-jobs et le consommateur de demonstration appartiennent a Python) reste partiellement atteint. Le worker, lui, est complet et deja branche sur l outbox commune.
