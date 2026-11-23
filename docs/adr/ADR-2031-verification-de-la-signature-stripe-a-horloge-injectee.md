# ADR-2031 — Vérification de la signature Stripe à horloge injectée

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-22
- **Liens** : SPEC-2206, ADR-0047, ADR-2015, ADR-0215

## Contexte

Le plan P22 (SPEC-2206) demande stripe.Webhook.construct_event(payload, sig, secret, tolerance=300). Le SDK Python 17.1.0 vérifie la fraîcheur avec l'horloge du processus : verify_header ne prend aucun instant. Les tests et l'intégration continue de la piste Python sont figés au 2026-11-11T12:20:00Z (ADR-0047), donc un appel réel au SDK refuserait toute signature produite par l'horloge injectée comme expirée, et un test ne pourrait pas prouver la tolérance de 300 s de façon déterministe (le SDK TypeScript, lui, accepte un paramètre now).

## Décision

Le schéma documenté par Stripe (en-tête t=<secondes>,v1=<HMAC-SHA256 hexadécimal de « t.corps »>, tolérance de 300 s) est porté dans learny.billing.domain.webhook.verify_signature avec l'horloge injectée. La passerelle live (learny.platform.stripe.StripeSdkGateway) vérifie la signature avec cette fonction puis normalise l'événement ; elle n'appelle jamais Webhook.construct_event pour la fraîcheur. Le SDK stripe reste utilisé pour les appels réseau (clients, sessions Checkout et portail, relecture d'abonnement) et l'empreinte de la bibliothèque est épinglée par ADR-2015.

## Conséquences

Les passerelles simulée et réelle partagent une seule implémentation de vérification, donc la tolérance et les codes d'erreur sont identiques entre les deux modes et reproductibles. Toute évolution du schéma Stripe doit être reportée à la main dans verify_signature et couverte par les vecteurs d'oracle. Un écart entre le SDK et ce port est une anomalie à corriger dans le port, jamais dans les tests.
