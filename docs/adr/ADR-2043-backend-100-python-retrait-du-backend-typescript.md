# ADR-2043 — Backend 100 % Python, retrait du backend TypeScript

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-23
- **Liens** : SPEC-2302, ADR-2001, ADR-2005, ADR-2006, ADR-2008, ADR-2012, ADR-2019, ADR-2035, ADR-2041

## Contexte

Jusqu'à la phase P23, deux runtimes servaient la même API. Le TypeScript fournissait `apps/api` (Hono), `apps/worker` (Inngest et ses fonctions), onze paquets serveur (`api-routes`, `services`, `jobs`, `llm`, `tutor`, `ingestion`, `notifications`, `automations`, `learning-engine`, `http`, et la partie runtime de `db`), ses Dockerfiles, ses services Compose et ses étapes de CI. La façade FastAPI recevait tout le trafic et relayait vers Hono les entrées que `api/ownership.yaml` marquait `ts` (ADR-2005) : une entrée ne passait à `py` qu'après parité prouvée, et le relais garantissait qu'aucune opération n'était servie deux fois.

Les sept spécifications de la piste Python (SPEC-2201 à SPEC-2207) ont porté le contrat entier : chaque opération, chaque route spéciale, chaque consommateur d'événement et chaque cron. À l'ouverture de SPEC-2302, plus aucune entrée n'était marquée `ts`, plus aucune fonction Inngest n'était souscrite, et l'inventaire de migration ne trouvait plus de paquet backend TypeScript à citer. ADR-2019, ADR-2035 et ADR-2041 avaient déjà retiré les démonstrations `/_dev`, les routes de développement et les compteurs associés ; ADR-2042 a réduit le contrat d'environnement au seul backend Python.

La coexistence avait un coût certain — deux jeux de variables et d'images, deux implémentations du même contrat à faire évoluer, deux suites de tests, des runbooks de bascule et de rollback du relais — et un bénéfice devenu nul : le filet ne protégeait plus que du code que personne n'exécutait. La contrainte non négociable reste l'invariant d'ADR-1001 et ADR-2008 : aucun changement fonctionnel visible, aucune assertion d'oracle modifiée, aucune ligne de base visuelle régénérée.

## Décision

**1) Un seul backend, Python.** La façade FastAPI (`apps/api-py`, `uvicorn learny_api.main:app`) et le worker Python (`python -m learny_worker`) servent tout le contrat : 156 opérations d'`api/openapi.yaml`, 11 routes spéciales hors pipeline générique, 23 consommateurs d'événements et 2 crons. Aucun chemin de requête, d'événement ou de tâche ne dépend plus d'un processus TypeScript, et rien ne relaie vers un autre runtime.

**2) Ce qui est supprimé.** `apps/api` et `apps/worker` ; Inngest (fonctions, synchronisation, interface, services Compose et variables) ; les paquets `api-routes`, `services`, `jobs`, `llm`, `tutor`, `ingestion`, `notifications`, `automations`, `learning-engine`, `http` ; le mécanisme `api/ownership.yaml`, `OWNERSHIP_OVERRIDES` et `PY_HONO_UPSTREAM_URL` ; la notion de propriétaire `ts`/`py` et le relais qui la lisait ; les Dockerfiles, les configurations Vercel, les services Compose et les étapes de CI du backend TypeScript. Les oracles e2e, visuels et de contrat restent inchangés : ils ont été rejoués contre la façade Python.

**3) Ce qui reste en TypeScript, et pourquoi.** `packages/contracts` reste la source unique du contrat (registre Zod, export `api/openapi.yaml`, catalogue d'erreurs, schémas d'événements) : c'est un artefact de description, sans règle métier ni accès aux données, consommé par la génération Python (`tools/contract/generate-py-contract.mjs`, ADR-2012) et par le SDK. Restent également les clients et leurs dépendances — `apps/web`, `apps/mobile` (autre piste), `api-client`, `api-sdk`, `bricks`, `config`, `core`, `db` (schéma Drizzle, migrations, matrice RLS), `domain`, `i18n`, `testing`, `ui`. Aucun de ces paquets ne porte de règle serveur : le web et le mobile sont des clients purs de l'API, et le schéma `db` ne sert qu'à produire les migrations et la matrice RLS, jamais à répondre à une requête.

**4) Le garde-fou remplace le relais.** La complétude n'est plus vérifiée par une table de propriété mais par construction : `pipeline.install` refuse de démarrer une opération sans handler, et `apps/api-py/tests/unit/test_route_coverage.py` (`[SPEC-2302]`) compare l'inventaire aux routes installées, à la table générée et au registre spécial, y compris les doublons et les handlers orphelins. `tools/migration/inventory.mjs` vérifie la même chose hors Python (`--check` en dérive, `--runtime` en verdict) et prouve qu'aucun chemin back-end TypeScript ne subsiste.

**5) Le retrait est réversible par le déploiement, pas par le runtime.** Le rollback d'une régression Python est le retour à l'image précédente (procédure de `docs/operations/python-cutover.md`), pas le basculement vers Hono.

## Conséquences

Une seule implémentation du contrat, un seul jeu de tests serveur, une seule image d'API : une correction n'a plus à être faite deux fois et une divergence entre runtimes n'est plus possible. La CI perd les étapes TypeScript du backend et gagne un inventaire qui échoue dès qu'une opération, un consommateur ou un cron n'est plus servi par Python ; `openapi:check` disparaît avec son artefact (`apps/api/openapi.json`), `lint` ne cite plus de script mort.

En contrepartie, le filet de relais n'existe plus : une régression Python est une panne, sans repli automatique. Les mesures de charge, la campagne e2e/visuelle complète (cross-browser, axe) et les exercices de restauration restent donc la seule preuve de non-régression, et elles ne sont pas rejouées dans ce lot : le staging d'ADR-2009 n'est pas disponible, SPEC-2302 reste `in_progress` et les commandes, dates et résultats manquants sont consignés dans `evidence/SPEC-2302/acceptance.md`.

Les documents d'architecture et d'exploitation décrivent désormais un backend unique (`AGENTS.md`, `README.md`, `docs/architecture/{overview,api,ai,data-model}.md`, `docs/architecture/python-backend/*`, `docs/engineering/{conventions,testing}.md`, `docs/operations/*`). ADR-1002 et ADR-0017 portent la ligne « Remplacée par ADR-2001 / ADR-2006 ». Le lissage des compteurs est assumé : le registre d'avant P23 comptait 217 routes, l'inventaire final en compte 156 après le retrait des démonstrations `/_dev` (ADR-2041) ; les 156 sont toutes servies par Python.

Points restés ouverts : la suppression du projet Vercel de l'API et de son domaine est une action du porteur, listée dans le runbook ; le worker garde un ordonnanceur unique protégé par verrou consultatif PostgreSQL, à revoir si l'échelle l'exige ; la campagne de charge et les exercices de restauration restent à rejouer sur le staging fourni par le porteur.

## Tableau des retraits

| Chemin retiré | Nature | Remplacé par |
|---|---|---|
| `apps/api` | application Hono (217 routes, OpenAPI servi) | `apps/api-py`, façade FastAPI |
| `apps/worker` | fonctions Inngest, crons, synchronisation | `apps/worker-py` (outbox PostgreSQL) |
| `packages/api-routes` | implémentations, manifeste des routes spéciales | `learny_api/handlers`, `learny_api/special` |
| `packages/services` | cas d'usage et SQL | domaines `learny.*` (public/application/infrastructure) |
| `packages/jobs`, `packages/automations` | définitions Inngest, moteur d'automatismes | `learny_worker/consumers.py`, `learny.engagement` |
| `packages/llm`, `packages/tutor`, `packages/ingestion` | fournisseurs LLM, tuteur, extraction | `learny.platform.llm`, `learny.tutor`, `learny.content` |
| `packages/notifications`, `packages/http` | notifications, pipeline HTTP | `learny.engagement`, `learny_api/pipeline.py` |
| `packages/learning-engine` | moteur d'apprentissage | `learny.learning` |
| `api/ownership.yaml`, `OWNERSHIP_OVERRIDES`, `PY_HONO_UPSTREAM_URL` | table de propriété et relais | aucun (plus de relais) |
| `packages/contracts/scripts/generate-openapi.ts`, scripts `openapi:*` | artefact `apps/api/openapi.json` | `contract:export` (`api/openapi.yaml`) |
