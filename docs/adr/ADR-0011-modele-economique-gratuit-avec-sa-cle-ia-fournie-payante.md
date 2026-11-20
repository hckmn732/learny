# ADR-0011 — Modèle économique : gratuit avec sa clé, IA fournie payante

- **Statut** : Partiellement remplacée par ADR-0340 (plus d’IA fournie payante : l’abonnement n’est plus que le droit d’usage, gratuit par défaut)
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-210, SPEC-725

> Partiellement remplacée par ADR-0340 : la plateforme ne fournit aucun modèle ; seule la gratuité avec sa propre clé demeure. Le texte ci-dessous est conservé pour l’historique.

## Contexte

Décision du porteur du projet.

## Décision

Sans abonnement, l'utilisateur doit configurer une clé qualifiée pour chaque tâche IA qu'il veut utiliser. L'abonnement mensuel Stripe (un seul prix, `STRIPE_PRICE_ID`) donne accès à l'IA fournie. Le montant est une configuration Stripe hors code.

## Conséquences

Les tests utilisent Stripe en mode test ou un faux client Stripe (`STRIPE_MODE=mock`).
