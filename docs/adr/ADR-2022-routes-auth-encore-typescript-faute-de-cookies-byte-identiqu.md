# ADR-2022 — Routes auth encore TypeScript faute de cookies byte-identiques

- **Statut** : Remplacée par ADR-2034 (portée par SPEC-2207)
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-21
- **Liens** : SPEC-2201, ADR-2005, ADR-2008, ADR-2010

## Contexte

SPEC-2201 demande de porter les 5 operations auth.* en Python et exige un Set-Cookie octet pour octet identique a @supabase/ssr. La valeur du cookie est le JSON de session serialise par supabase-js (access_token, expires_at, refresh_token et l objet user complet renvoye par GoTrue), decoupe a 3180 caracteres et prefixe base64-. Reproduire ce JSON en Python suppose de conserver le document GoTrue brut, l ordre de ses cles et les champs ajoutes par supabase-js ; aucune capture de parite ni vecteur supabase-cookies n existe dans api/oracles (le groupe identity de tools/parity n a jamais ete enregistre), et le script pnpm parity:check cite par le plan n est pas defini dans package.json.

## Décision

Les routes auth.magicLink, auth.resend, auth.signIn, auth.signOut et auth.signUp restent ts dans api/ownership.yaml. Le pipeline Python porte deja freshAuth et la resolution d acteur necessaires aux routes basculees ; les cookies seront portes quand un enregistrement de parite auth existera et permettra de comparer octet pour octet.

## Conséquences

Identity est servi a 13 operations sur 19. Sign-in, sign-up et deconnexion restent relais vers Hono, donc la facade n est pas encore autonome pour l authentification. Un test de parite auth (creation de compte locale, sign-in, rafraichissement) doit etre enregistre avant toute bascule.
