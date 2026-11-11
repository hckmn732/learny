# ADR-0061 — Paiement Stripe

- **Statut** : Acceptée
- **Origine** : Validée (décision prise avec le porteur du projet)
- **Date** : 2026-11-11
- **Liens** : SPEC-210

## Contexte

Abonnement IA fournie.

## Décision

Stripe Checkout (abonnement), portail client, webhooks signés (`checkout.session.completed`, `customer.subscription.updated|deleted`, `invoice.payment_failed`) ; `STRIPE_MODE=mock` pour les tests.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
