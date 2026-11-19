# ADR-0340 — Authentification multi-clients et API derrière un proxy

- **Statut** : Acceptée — complète ADR-0121, ADR-0252 et ADR-0258
- **Origine** : Validée (décision prise avec le porteur du projet, 2026-11-18)
- **Date** : 2026-11-18
- **Liens** : ADR-0336, ADR-0121, ADR-0252, ADR-0258, SPEC-1102, SPEC-1201, SPEC-1301

## Contexte

Aujourd'hui l'API n'accepte que le cookie de session Supabase (`@supabase/ssr`) et vérifie chaque requête par `supabase.auth.getUser()`, soit un aller-retour réseau vers le serveur d'authentification. Après la séparation :

- une page rendue côté serveur déclencherait trois vérifications (proxy, page, API) ;
- les applications natives n'ont pas de cookie ;
- l'API est atteinte au travers de la réécriture de `apps/web` : l'en-tête `Host` reçu par l'API devient celui de l'API alors que `Origin` reste celui du web, ce qui ferait refuser toutes les mutations par la garde d'origine (ADR-0258) ; l'adresse du client utilisée par la limitation de débit doit aussi être lue au bon endroit.

## Décision

1. **Deux transports d'identité**, résolus dans cet ordre par `@learny/http` : en-tête `Authorization: Bearer <jeton d'accès Supabase>`, sinon cookie de session Supabase. Une requête qui fournit les deux est authentifiée par le Bearer.
2. **Vérification locale du jeton** : la signature, l'émetteur, l'audience `authenticated` et l'expiration du JWT sont vérifiés localement (`supabase.auth.getClaims()` avec les clés publiques JWKS du projet, ou la clé `SUPABASE_JWT_SECRET` en local et en CI) ; aucun appel réseau par requête. Les opérations sensibles qui exigent l'état à jour du compte (déconnexion, suppression, changement d'identifiants) continuent d'appeler `auth.getUser()`.
3. Le rafraîchissement de la session reste du ressort du client : `proxy.ts` pour le web (ADR-0252), le SDK Supabase pour le mobile. L'API ne pose jamais de cookie de session hors des routes `/auth/*`.
4. **Garde d'origine derrière proxy** : l'origine de la requête est reconstituée depuis `X-Forwarded-Host` et `X-Forwarded-Proto` **uniquement** si la requête provient d'un proxy de confiance, c'est-à-dire si elle porte l'en-tête `X-Learny-Proxy-Secret` égal à `API_PROXY_SECRET` (secret serveur partagé entre `apps/web` et `apps/api`, jamais exposé au navigateur). Sinon `Host` fait foi. `ALLOWED_ORIGINS` reste la liste des origines web autorisées.
5. **Adresse du client** : derrière le proxy de confiance, l'adresse est la première valeur de `X-Forwarded-For` transmise par `apps/web` ; sinon les règles de ADR-0258 s'appliquent inchangées.
6. **Clients natifs** : les requêtes Bearer sans en-tête `Origin` ne sont pas soumises à la garde d'origine (pas de risque CSRF sans cookie). CORS n'est activé que pour les origines de `ALLOWED_ORIGINS` (SPEC-1301).

## Conséquences

- Nouvelles variables serveur dans `@learny/config` : `API_INTERNAL_URL`, `API_PROXY_SECRET` (32 octets aléatoires au moins), `SUPABASE_JWKS_URL` (facultative, déduite de `NEXT_PUBLIC_SUPABASE_URL`).
- Les tests de sécurité existants (SPEC-208, SPEC-805) sont rejoués contre `apps/api`, directement et au travers du proxy.
