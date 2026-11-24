"""User-facing French strings of the billing context (SPEC-210, ADR-0215, ADR-2011).

Every literal is copied verbatim from the reference implementation. Never referenced by a
literal in the code (ADR-2011).
"""

# `config.ts` - `STRIPE_MODE=mock` is refused in production (defence in depth).
MOCK_FORBIDDEN_IN_PRODUCTION = "STRIPE_MODE=mock est interdit en production."

# `stripe-client.ts` - the payment provider is unreachable or misconfigured.
UNAVAILABLE = "Le service de paiement est momentanément indisponible."
# `stripe-client.ts` - `StripeInvalidRequestError` with `resource_missing`.
RESOURCE_NOT_FOUND = "Ressource de paiement introuvable."

# `stripe-event.ts` - the `Stripe-Signature` header of the raw body.
SIGNATURE_MISSING = "Signature du webhook absente."
SIGNATURE_UNREADABLE = "Signature du webhook illisible."
SIGNATURE_INVALID = "Signature du webhook invalide."
SIGNATURE_EXPIRED = "Signature du webhook expirée."
EVENT_UNREADABLE = "Événement Stripe illisible."

# `checkout.ts` - return paths stay inside the application (CL-5).
RETURN_PATH_INVALID = "Chemin de retour invalide."
RETURN_PATH_EXTERNAL = "Le chemin doit être interne à l’application."

# `checkout.ts` - authenticated learner and subscription state (EF-1, EF-2).
UNAUTHENTICATED = "Vous devez être connecté."
SUBSCRIPTION_NOT_FOUND = "Abonnement introuvable."
ALREADY_SUBSCRIBED = "Votre abonnement est déjà actif."
NO_SUBSCRIPTION_TO_MANAGE = "Aucun abonnement à gérer."

# SPEC-210 EF-7, EF-8, SPEC-2207.
SIMULATION_UNAVAILABLE = "La simulation n’est disponible qu’avec STRIPE_MODE=mock."
SESSION_NOT_FOUND = "Session de paiement introuvable."
NO_WEBHOOK_TO_REPLAY = "Aucun webhook à rejouer."
NO_SIMULATED_SUBSCRIPTION = "Aucun abonnement simulé pour cet utilisateur."
