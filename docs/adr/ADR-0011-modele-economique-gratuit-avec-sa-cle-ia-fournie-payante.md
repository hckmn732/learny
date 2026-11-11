# ADR-0011 — Modèle économique : gratuit avec sa clé, IA fournie payante

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-210, SPEC-725

## Contexte

Décision du porteur du projet.

## Décision

Sans abonnement, l'utilisateur doit configurer une clé qualifiée pour chaque tâche IA qu'il veut utiliser. L'abonnement mensuel Stripe (un seul prix, `STRIPE_PRICE_ID`) donne accès à l'IA fournie. Le montant est une configuration Stripe hors code.

## Conséquences

Les tests utilisent Stripe en mode test ou un faux client Stripe (`STRIPE_MODE=mock`).
