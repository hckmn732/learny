# `packages/llm/fixtures` â€” donnÃ©e de test du modÃ¨le simulÃ©

Ce dossier ne contient plus de code TypeScript : `packages/llm` est supprimÃ© (ADR-2001,
SPEC-2302). Les enregistrements JSON restent la source des rÃ©ponses du modÃ¨le simulÃ©, lues au
dÃ©marrage par `learny.platform.llm.mock` (`fixtures_directory`, ADR-2042, aucun override
d'environnement).

Le dÃ©placement vers `packages-py/learny/src/learny/platform/llm/fixtures/` demandÃ© par l'Ã©tape 2.5
du plan P23 appartient au lot qui possÃ¨de `packages-py/` : ce lot-ci ne peut pas modifier les
chargeurs Python.
