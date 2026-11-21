# ADR-2005 — Coexistence par façade Python et table de propriété des routes

- **Statut** : Acceptée
- **Origine** : Déduite (préparation de la piste python-migration)
- **Date** : 2026-11-21
- **Liens** : ADR-1001, ADR-2001, ADR-2004, SPEC-2003, SPEC-2301

## Contexte

La migration se fait domaine par domaine sur une base de données partagée ; il ne doit jamais y avoir deux écrivains pour la même donnée, et chaque étape doit être réversible.

## Décision

- L'API Python est la **façade** unique appelée par le web dès SPEC-2003 : chaque opération est soit servie par Python, soit relayée telle quelle (corps, en-têtes, cookies, flux SSE) vers l'API Hono.
- `api/ownership.yaml` attribue chaque opération, chaque type d'événement et chaque tâche planifiée à exactement un propriétaire (`ts` ou `py`). Il est lu au démarrage ; un test CI vérifie qu'il couvre les 217 opérations et tous les événements/tâches inventoriés.
- Une spécification de domaine bascule ses entrées à `py` uniquement quand ses tests de parité passent ; le TypeScript cesse alors de servir et de consommer ces entrées.
- En production (SPEC-2301), la propriété peut être surchargée par drapeau d'environnement et par pourcentage de canary sur les lectures uniquement ; une écriture n'a jamais deux propriétaires actifs.
- Le retour arrière consiste à remettre une entrée à `ts` : le schéma de base et les événements restent compatibles avec les deux runtimes jusqu'au retrait.

## Conséquences

Les e2e passent par la façade Python dès SPEC-2003, ce qui prouve en continu que la coexistence ne change aucun comportement visible.
