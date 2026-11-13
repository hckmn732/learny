# ADR-0303 — Horloge cliente, profil minimal et messages de lien invalide pour SPEC-601

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-13
- **Liens** : SPEC-601, ADR-0047, ADR-0168

## Contexte

SPEC-601 demande un hook useClock de @learny/core/clock, mais @learny/core est volontairement sans React ; EF-10 appelle GET /api/v1/me alors que cette route appartient à SPEC-602 ; SPEC-202 redirige déjà les liens invalides vers ?erreur=lien-invalide alors que EF-11 nomme ?erreur=lien-expire.

## Décision

Le hook useClock vit dans apps/web/lib/auth/use-clock.ts et lit clock.now() de @learny/core via useSyncExternalStore ; GET /api/v1/me est livré avec le DTO complet attendu par SPEC-602 ; /connexion affiche le message d'expiration pour lien-expire comme pour lien-invalide.

## Conséquences

Aucune dépendance React ajoutée à @learny/core ; SPEC-602 étend le service existant ; les deux codes d'erreur de lien produisent le même message.
