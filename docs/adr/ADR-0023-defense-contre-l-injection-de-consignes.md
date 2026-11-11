# ADR-0023 — Défense contre l'injection de consignes

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-508, SPEC-805

## Contexte

Les apports peuvent contenir du texte malveillant.

## Décision

Apports transmis dans des balises de données ; consignes système explicites ; actions bornées par le registre ; tests avec apports piégés (« ignore les instructions… ») qui doivent rester sans effet.

## Conséquences

Un test de non-régression de sécurité par tâche IA.
