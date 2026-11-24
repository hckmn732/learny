// Garde des règles des stores sur le client d'API du mobile (SPEC-3401 ET-3, CA-5 ; ADR-3006).
//
// Le magasin d'applications interdit de vendre un abonnement ou d'ouvrir un portail de gestion en
// dehors de son propre flux d'achat : l'application mobile ne appelle donc **jamais**
// `POST /billing/checkout` ni `POST /billing/portal`, et se contente de lire l'abonnement
// (BR-SET-06). Cette garde est une fonction pure, appelée par la couche de données et vérifiée par
// `billing-guard.test.ts` (aucune occurrence des deux routes dans le code de l'application).
import { fr } from '@learny/i18n';

/** Identifiants des routes d'achat et de portail que le mobile n'appelle jamais (ET-3). */
export const PURCHASE_ROUTE_IDS = ['billing.checkout', 'billing.portal'] as const;

/** Noms des méthodes du client d'API correspondantes, telles que les utiliserait un écran. */
export const PURCHASE_CLIENT_METHODS = ['billingCheckout', 'billingPortal'] as const;

export type PurchaseRouteId = (typeof PURCHASE_ROUTE_IDS)[number];

/** Levée si un écran tentait d'appeler une route d'achat : c'est un défaut de conception. */
export class PurchaseRouteRefusedError extends Error {
  constructor(readonly routeId: string) {
    super(fr.mobile.profile.models.storeGuard);
    this.name = 'PurchaseRouteRefusedError';
  }
}

/** Vrai quand `routeId` est une route d'achat ou de portail (ET-3). */
export function isPurchaseRoute(routeId: string): boolean {
  return (PURCHASE_ROUTE_IDS as readonly string[]).includes(routeId);
}

/**
 * Garde de conception : refuse toute route d'achat. La lecture de l'abonnement
 * (`billing.subscription`) passe, c'est la seule route d'abonnement du périmètre mobile.
 */
export function assertNoPurchaseRoute(routeId: string): void {
  if (isPurchaseRoute(routeId)) throw new PurchaseRouteRefusedError(routeId);
}
