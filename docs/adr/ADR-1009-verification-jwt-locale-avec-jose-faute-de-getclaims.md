# ADR-1009 — Vérification JWT locale avec JOSE faute de getClaims

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-20
- **Liens** : ADR-1005,SPEC-1102

## Contexte

@supabase/supabase-js 2.119.0 et @supabase/auth-js 2.119.0 n'exposent pas auth.getClaims(); ADR-1005 exige néanmoins la vérification locale des Bearer Supabase avec JWKS ou HS256.

## Décision

Ajouter jose 6 à @learny/http: jwtVerify vérifie signature, algorithme, émetteur, audience authenticated et expiration selon l'horloge injectable; importJWK exploite un cache JWKS de dix minutes avec rechargement sur kid inconnu. Aucune demande Auth par lecture valide; auth.getUser reste le repli si JWKS est inaccessible et pour freshAuth.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
