# ADR-0215 — Statuts Stripe et droit a l'IA fournie

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-210

## Contexte

ADR-0011 et ADR-0061 fixent Checkout, portail et webhooks ; SPEC-110 fournit subscriptions avec cinq statuts. La correspondance entre etats Stripe et droit d'acces, l'ordre des webhooks et le comportement du mode mock ne sont pas definis.

## Décision

Correspondance : Stripe active ou trialing -> active ; past_due ou unpaid -> past_due ; canceled ou incomplete_expired -> canceled ; incomplete -> incomplete ; absence d'abonnement -> none. hasManagedAi(userId) est vrai si et seulement si status = active et current_period_end > clock.now(). Aucun delai de grace. Les webhooks sont verifies par signature (STRIPE_WEBHOOK_SECRET, tolerance 300 s), dedoublonnes par event.id dans stripe_events (pk event_id) et appliques seulement si event.created est superieur ou egal a subscriptions.stripe_event_at ; un evenement plus ancien est accuse 200 sans effet. Apres chaque evenement applique, l'etat est relu par l'API Stripe (subscriptions.retrieve) plutot que deduit du seul contenu. Un client Stripe par utilisateur, cree paresseusement au premier Checkout avec metadata.userId. STRIPE_MODE=mock : faux client en memoire deterministe, Checkout renvoie /_dev/stripe/checkout?session=<id> qui redirige vers successPath apres avoir emis un webhook simule signe avec STRIPE_WEBHOOK_SECRET de test ; interdit en production (validation SPEC-009).

## Conséquences

Nouvelle table stripe_events et colonne subscriptions.stripe_event_at (migration additive) ; SPEC-725 consomme GET /billing/subscription.
