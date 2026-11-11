# ADR-0029 — Planificateur glouton

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-407

## Contexte

Agenda calculé par le code.

## Décision

Algorithme glouton déterministe : pour chaque formation active (ordre de date de fin), chaque module, chaque activité (apports par chapitre, lecture du cours, exercice éventuel, quiz de validation, marge 1 h), placer au premier créneau libre compatible (jours d'étude, moments préférés, capacité horaire quotidienne cumulée). Quiz global quotidien 30 min en fin de journée d'étude. Replanification incrémentale à chaque événement (module validé, séance manquée, pause, changement de rythme). Si la date de fin ne tient pas : options BR-FOR-14.

## Conséquences

Durées par défaut des activités dans `packages/config/src/product.ts`.
