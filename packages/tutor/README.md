# `packages/tutor/prompts` â€” invites versionnÃ©es du tuteur

Ce dossier ne contient plus de code TypeScript : `packages/tutor` est supprimÃ© (ADR-2001,
SPEC-2302). Les fichiers Markdown restent la source de vÃ©ritÃ© des invites, lues au dÃ©marrage par
`learny.tutor.domain.prompts` (`prompts_directory`, ADR-2042, aucun override d'environnement).

Le dÃ©placement vers `packages-py/learny/src/learny/tutor/prompts/` demandÃ© par l'Ã©tape 2.5 du plan
P23 appartient au lot qui possÃ¨de `packages-py/`.
