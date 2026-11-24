# ADR-4006 — Services Python déclarés dans les piles Coolify, sans `include:`

- **Statut** : Acceptée
- **Origine** : Déduite (redéploiement de la QA, 2026-11-24)
- **Date** : 2026-11-24
- **Liens** : ADR-2007, ADR-2041, ADR-2043, ADR-4005, SPEC-2301

## Contexte

Depuis SPEC-2301, `api-py` et `worker-py` vivaient dans des fichiers séparés :
- `docker/compose.coolify-py.yml`, inclus par `docker/compose.coolify.yml` ;
- `docker/compose.coolify-qa-py.yml`, inclus par `docker/compose.coolify-qa.yml`.

L'inclusion servait à ne pas modifier la liste des services rendue par la page de topologie de SPEC-1103, dont la capture servait d'oracle.

Le redéploiement de la QA du 2026-11-24 a montré que **Coolify ne suit pas `include:`**. Il analyse lui-même le fichier Compose (`docker_compose_raw`) et génère son propre Compose de démarrage, dans lequel ni `api-py` ni `worker-py` n'apparaissaient. La construction passe par `docker compose build -f …` et aurait construit les images incluses, mais le démarrage aurait lancé le web sans backend. La page de topologie a par ailleurs été retirée avec les démonstrations (ADR-2041).

Le même redéploiement a révélé que `docker/web.Dockerfile` et `docker/qa-seed.Dockerfile` copiaient encore les manifestes des onze paquets TypeScript retirés (ADR-2043), sans ceux de l'application mobile et des paquets clients. Le chargeur de démonstration pointait aussi vers `packages/db/src/seed` au lieu de `packages/testing/src/db/seed`. Aucune construction ne passait donc plus.

## Décision

1. `api-py`, `worker-py` et l'ancre `x-py-environment` sont déclarés **dans** `docker/compose.coolify.yml` et `docker/compose.coolify-qa.yml`. Les deux fichiers inclus sont supprimés. Aucune pile déployée par Coolify n'utilise `include:`.
2. `tools/deploy/coolify.test.ts` vérifie l'absence d'`include:` et la présence des deux services dans chaque pile.
3. Les manifestes copiés par les Dockerfiles Node suivent l'espace de travail réel : `apps/*` et `packages/*`, application mobile comprise. Le job `seed` de la QA installe `@learny/testing` et lance `packages/testing/src/db/seed/cli.ts`.

## Conséquences

- Coolify démarre bien la façade et le worker Python avec le reste de la pile.
- Ajouter ou retirer un paquet de l'espace de travail implique de mettre à jour les lignes `COPY …/package.json` des deux Dockerfiles. L'installation figée l'exige, et sa vérification échoue sinon.
