---
id: SPEC-1102
title: Authentification multi-clients et protections derrière un proxy
phase: P11
priority: migration
depends_on: [SPEC-1101]
business_rules: []
screens: []
adrs: [ADR-1005, ADR-0121, ADR-0252, ADR-0258, ADR-0007]
visual: demo
---

# SPEC-1102 — Authentification multi-clients et protections derrière un proxy

## 1. Objectif

Permettre à `apps/api` d'authentifier un appelant par cookie de session (web) **ou** par `Authorization: Bearer` (clients natifs), en vérifiant le jeton localement plutôt que par un appel réseau à chaque requête, et garder intactes la garde d'origine et la limitation de débit quand l'API est atteinte au travers du proxy de `apps/web`.

## 2. Contexte

ADR-1005 fixe les règles. Aujourd'hui `packages/http/src/session.ts` (déplacé par SPEC-1003) lit les cookies et appelle `supabase.auth.getUser()` ; la garde d'origine compare `Origin` à l'origine reconstituée depuis `Host` (`hostOrigin()` de `security.ts`) ; l'adresse du client suit ADR-0258. Après SPEC-1201, `apps/web` relaiera `/api/v1/*` vers `apps/api` : sans cette spécification, `Host` deviendrait celui de l'API et toutes les mutations seraient refusées. Lire ADR-1005, ADR-0121, ADR-0252, ADR-0258, `docs/architecture/api.md` §1.

## 3. Dépendances

- **SPEC-1101** : `apps/api` et harnais `requestApi`.
- Bibliothèques : `@supabase/supabase-js` (`auth.getClaims`) ; `jose` seulement si `getClaims` ne couvre pas la vérification HS256 locale (version figée, ADR à créer par `adr.mjs` si ajoutée).
- Variables : `API_PROXY_SECRET` (≥ 32 octets aléatoires, serveur uniquement), `SUPABASE_JWT_SECRET` (local/CI, existante), `SUPABASE_JWKS_URL` (facultative).

## 4. Règles métier couvertes

Aucune règle `BR-*` nouvelle ; ADR-0007 (lien magique ou mot de passe) et ADR-0121 (flux d'authentification) restent appliqués à l'identique pour le web.

## 5. Exigences fonctionnelles

- **EF-1** — Une requête avec `Authorization: Bearer <jeton d'accès valide>` est authentifiée comme l'utilisateur du jeton, avec les mêmes réponses que la même requête faite avec le cookie de session de cet utilisateur.
- **EF-2** — Jeton expiré, mal signé, d'audience autre que `authenticated`, d'algorithme `none` ou mal formé → 401 `problem+json` (`code` identique au cas « session absente » actuel), sans appel réseau.
- **EF-3** — Une requête portant le cookie **et** un Bearer est authentifiée par le Bearer.
- **EF-4** — Les routes sensibles (`POST /auth/sign-out`, `POST /me/deletion`, `DELETE /me/deletion`, `POST /me/export`, `POST/DELETE /me/ai/credentials`) vérifient aussi l'état du compte par `auth.getUser()` ; un compte supprimé côté Auth avec un jeton encore valide → 401.
- **EF-5** — Derrière le proxy de confiance (en-tête `X-Learny-Proxy-Secret` égal à `API_PROXY_SECRET`), la garde d'origine utilise `X-Forwarded-Host` et `X-Forwarded-Proto`, et la limitation de débit utilise la première adresse de `X-Forwarded-For`. Sans secret valide, ces en-têtes sont ignorés.
- **EF-6** — Une requête Bearer **sans** en-tête `Origin` n'est pas soumise à la garde d'origine ; avec un `Origin`, elle y est soumise comme une requête cookie.
- **EF-7** — La page `/_dev/sdd/SPEC-1102` exécute quatre scénarios contre `apps/api` (`GET /api/v1/me`) : cookie de démonstration, Bearer de démonstration, Bearer expiré, mutation relayée avec et sans secret de proxy ; elle affiche statut et `code` de chacun.

## 6. Exigences techniques

- **ET-1** — `packages/http/src/session.ts` : `resolveIdentity(request, deps) → { userId, claims, transport: 'bearer' | 'cookie' } | null` ; vérification locale par `getClaims()` (clés JWKS mises en cache 10 minutes, avec la date de l'horloge injectable) ou par HS256 avec `SUPABASE_JWT_SECRET` quand le projet n'expose pas de JWKS (local, CI).
- **ET-2** — `RouteDef` gagne le drapeau facultatif `freshAuth?: true`, posé sur les routes d'EF-4 dans `packages/contracts` ; `handler()` appelle `auth.getUser()` uniquement pour ces routes. Le document OpenAPI n'en est pas modifié (drapeau interne).
- **ET-3** — `packages/http/src/security.ts` : `requestOrigin(request, env)` et `clientAddress(request, env)` appliquent EF-5 ; la comparaison du secret est à temps constant (`timingSafeEqual`).
- **ET-4** — `@learny/config` : `API_PROXY_SECRET` (obligatoire en production pour `apps/web` et `apps/api`, chaîne ≥ 32 caractères), `SUPABASE_JWKS_URL` (URL facultative) ; `secret-patterns.ts` reconnaît `API_PROXY_SECRET` pour les contrôles de fuite.
- **ET-5** — Compteur d'appels au serveur d'authentification dans les tests (substitut de `fetch`) : une page lue en GET avec un jeton valide n'en fait **aucun**.
- **ET-6** — Aucun jeton ni secret n'apparaît dans les journaux (`redactText` étendu à `Bearer …` et `X-Learny-Proxy-Secret`).

## 7. Comportements attendus et cas limites

- **CL-1** — JWKS injoignable au démarrage → repli sur l'appel `auth.getUser()` pour la requête, journal d'avertissement unique par minute ; jamais d'acceptation sans vérification.
- **CL-2** — Rotation de clé (identifiant `kid` inconnu) → un rechargement JWKS, puis 401 si toujours inconnu.
- **CL-3** — Horloge figée des tests (ADR-0047) → l'expiration est évaluée avec l'horloge injectable.
- **CL-4** — `X-Forwarded-*` présents sans secret → ignorés ; une mutation dont `Origin` ne correspond pas à `Host` → 403 `ORIGIN_REJECTED` comme aujourd'hui.
- **CL-5** — Secret de proxy erroné → traité comme absent (pas de 401 distinct, pour ne pas révéler l'existence du secret).
- **CL-6** — En-tête `Authorization` d'un autre schéma (`Basic`) → ignoré, repli sur le cookie.

## 8. Instructions d'implémentation

1. `resolveIdentity` et vérification locale, tests unitaires des jetons. Commit `feat(SPEC-1102): authentifie par jeton Bearer vérifié localement`.
2. Drapeau `freshAuth`, routes sensibles, compteur d'appels. Commit `feat(SPEC-1102): revérifie le compte sur les routes sensibles`.
3. Proxy de confiance (origine, adresse), configuration et masquage des secrets. Commit `feat(SPEC-1102): protège l'API derrière le proxy du web`.
4. Tests d'intégration contre `apps/api` (et contre Next pour la parité cookie), démonstration, e2e, visuel. `validate.mjs`, `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/http/src/jwt.ts`, `packages/http/src/jwt.test.ts`, `apps/api/test/integration/auth-transports.test.ts`, `apps/api/test/integration/proxy-trust.test.ts`, `packages/contracts/src/dev-migration.ts` (routes `dev.sddAuthScenarios` si la démonstration en a besoin), `apps/web/components/sdd-demos/spec-1102.tsx`, `apps/web/e2e/specs/p11/spec-1102.spec.ts`.
- **Modifiés** : `packages/http/src/{session,security,handler}.ts`, `packages/contracts/src/define-route.ts` (`freshAuth`), `packages/contracts/src/{auth,me,personal-data,ai-credentials}.ts` (drapeau), `packages/config/src/{server,secret-patterns}.ts`, `packages/core/src` (`redactText`), `.env.example`, `docs/architecture/api.md` §1 (authentification), `apps/web/app/%5Fdev/sdd/registry.ts`.
- **Lus** : ADR-0258, `packages/services/src/security/origin-guard.ts`.

## 10. Interface et conformité visuelle

Mode `demo`. `/_dev/sdd/SPEC-1102` : `h1` « Authentification multi-clients » ; tableau `data-testid="spec-1102-scenarios"` (« Scénario », « Statut attendu », « Statut obtenu », « Code ») avec cinq lignes : cookie (200), Bearer (200), Bearer expiré (401), mutation relayée avec secret (200), mutation relayée sans secret avec hôte différent (403). Bouton « Rejouer ». Contrôles : jetons, structure, axe, captures desktop et mobile ≤ 1 %.

## 11. Critères d'acceptation

- **CA-1** — `GET /api/v1/me` renvoie le même DTO par cookie et par Bearer ; les jetons invalides (5 variantes d'EF-2) renvoient 401.
- **CA-2** — Aucune requête vers le serveur d'authentification pour une lecture authentifiée par jeton valide ; exactement une pour une route `freshAuth`.
- **CA-3** — Une mutation relayée avec secret, `Origin` du web et `Host` de l'API est acceptée ; sans secret elle est refusée 403 `ORIGIN_REJECTED`.
- **CA-4** — La limitation de débit compte par adresse transmise seulement derrière le proxy de confiance.
- **CA-5** — Aucun jeton ni secret dans les journaux capturés par les tests ; la démonstration affiche les cinq scénarios conformes.

## 12. Plan de tests

- **Unitaires** — `packages/http/src/jwt.test.ts`, `describe('[SPEC-1102] local token verification')` : signature, audience, expiration à l'horloge figée, `none`, `kid` inconnu (CA-1) ; `describe('[SPEC-1102] trusted proxy')` : origine et adresse avec et sans secret, comparaison à temps constant (CA-3, CA-4) ; masquage (CA-5).
- **Intégration** — `apps/api/test/integration/auth-transports.test.ts`, `describe('[SPEC-1102] auth transports')` : parité DTO, compteur d'appels, `freshAuth` (CA-1, CA-2) ; `proxy-trust.test.ts`, `describe('[SPEC-1102] proxy trust')` : mutation relayée, limitation (CA-3, CA-4) ; rejeu des suites `[SPEC-208]` contre `hono`.
- **End-to-end** — `apps/web/e2e/specs/p11/spec-1102.spec.ts`, `test('rejoue les scénarios d authentification @SPEC-1102')` (CA-5), vidéo.
- **Visuel** — `test('démonstration de l authentification multi-clients @SPEC-1102 @visual')` (CA-5).
- **Non-régression** — `@SPEC-202`, `[SPEC-208]`, `@SPEC-805`, `@SPEC-211`.

| Critère | Tests |
|---|---|
| CA-1 | unitaire jetons ; intégration transports |
| CA-2 | intégration transports |
| CA-3 | unitaire proxy ; intégration proxy |
| CA-4 | unitaire proxy ; intégration proxy |
| CA-5 | unitaire masquage ; e2e ; `@visual` |

## 13. Preuves attendues

`evidence/SPEC-1102/` : rapports, vidéo, captures, table des scénarios, mesure du nombre d'appels au serveur d'authentification avant/après, extrait de journaux masqués, `checks.json`, `acceptance.md`.

## 14. Définition de terminé

Conditions communes, plus : le parcours d'authentification web (`@SPEC-202`) est inchangé et aucune variable secrète n'est préfixée `NEXT_PUBLIC_`.

## 15. Décisions et hypothèses

ADR-1005 fixe transports, vérification locale, routes sensibles et proxy de confiance. Hypothèse : le projet Supabase géré expose des clés asymétriques (JWKS) ; sinon le repli HS256 s'applique avec `SUPABASE_JWT_SECRET` côté serveur. Aucune question ouverte.
