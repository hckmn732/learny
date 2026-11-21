# ADR-2011 — Backend Python rédigé en anglais et canevas technique normatif

- **Statut** : Acceptée
- **Origine** : Validée (décision du porteur du projet)
- **Date** : 2026-11-21
- **Liens** : ADR-2001, ADR-2003, docs/architecture/python-backend

## Contexte

Le porteur du projet demande que tout le backend soit écrit en anglais et qu'une direction technique complète soit donnée à l'agent qui exécutera SPEC-2001 → SPEC-2302. Le contrat visible (titres et détails d'erreur, messages de validation, e-mails, flux SSE) est aujourd'hui en français et doit rester identique (ADR-1001).

## Décision

- Code Python, identifiants, commentaires, docstrings, journaux, noms de tests et documentation du backend en **anglais**.
- Les textes vus par l'utilisateur restent en français, copiés à l'identique depuis le TypeScript, et sont isolés dans `learny/shared/locale_fr/` et les gabarits Jinja2 ; un test refuse les textes français ailleurs.
- Les noms de tables, colonnes, champs JSON, routes, événements, codes d'erreur et valeurs stockées ne changent pas (contrat).
- Artefacts SDD (specs, ADR, preuves, messages de commit) : convention du dépôt (français).
- `docs/architecture/python-backend/` (conventions, plans P20 → P23, prototypes) est **normatif pour l'implémentation** des specs SPEC-2xxx, après les ADR, les règles métier et les specs.

## Conséquences

L'agent exécutant suit le canevas ; tout écart observable avec le TypeScript l'emporte sur le canevas et donne lieu à un ADR.
