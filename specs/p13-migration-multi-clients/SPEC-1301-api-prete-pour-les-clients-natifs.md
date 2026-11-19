---
id: SPEC-1301
title: API prête pour les clients natifs
phase: P13
priority: migration
depends_on: [SPEC-1203]
business_rules: []
screens: []
adrs: [ADR-0339, ADR-0340, ADR-0342, ADR-0120]
visual: demo
---

# SPEC-1301 — API prête pour les clients natifs

## 1. Objectif

Rendre l'API consommable par un client qui n'est pas le web : un client Android/iOS (ADR-0339) ou tout autre consommateur doit pouvoir s'authentifier auprès de Supabase, appeler toutes les routes utilisateur avec `Authorization: Bearer`, consommer le flux SSE du tuteur et lire un contrat OpenAPI complet. Aucun écran n'est ajouté ; la preuve est un **client natif simulé** exécuté en test.

## 2. Contexte

SPEC-1102 a livré l'authentification Bearer et la vérification locale. Il reste à : déclarer la sécurité dans OpenAPI, ouvrir CORS de façon contrôlée pour d'éventuelles origines web distinctes, donner à `@learny/api-client` un mode « jeton » avec rafraîchissement, et documenter la politique de version de `/api/v1`. Les notifications push natives et l'application `apps/mobile` sont hors de cette spécification (ADR-0339 §4). Lire ADR-0339, ADR-0340, ADR-0342, ADR-0120, `docs/architecture/api.md` §1.

## 3. Dépendances

- **SPEC-1203** : web client pur, API seule source.
- Supabase Auth local (mot de passe, ADR-0007) pour obtenir un jeton dans les tests.

## 4. Règles métier couvertes

Aucune règle `BR-*` ; les mêmes règles s'appliquent quel que soit le client.

## 5. Exigences fonctionnelles

- **EF-1** — Le document OpenAPI déclare deux schémas de sécurité, `bearerAuth` (HTTP bearer, JWT) et `cookieAuth` (cookie de session Supabase), et chaque route `auth: 'user'` les exige (l'un ou l'autre) ; les routes publiques n'en déclarent aucun.
- **EF-2** — CORS : `apps/api` répond aux requêtes préliminaires (`OPTIONS`) et ajoute `Access-Control-Allow-Origin` uniquement pour les origines de `ALLOWED_ORIGINS`, avec `Access-Control-Allow-Credentials: true`, méthodes du registre, en-têtes `Authorization, Content-Type, Idempotency-Key, X-Request-Id` et `Access-Control-Expose-Headers: X-Request-Id, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After`. Une origine non listée ne reçoit aucun en-tête CORS.
- **EF-3** — `@learny/api-client` : `createApiClient({ baseUrl, getAccessToken, refreshAccessToken })` ajoute `Authorization: Bearer` ; sur 401, appelle `refreshAccessToken()` une fois puis rejoue la requête ; expose `streamTutorReply(conversationId, body)` qui lit le flux SSE et produit les parties du message (texte, sources, suites) dans l'ordre.
- **EF-4** — Politique de version écrite dans `docs/architecture/api.md` §3 « Versions et clients » : `/api/v1` n'accepte que des changements rétrocompatibles (ajout de champ facultatif, de route, de code d'erreur) ; tout changement incompatible passe par `/api/v2` ; une route retirée est annoncée par l'en-tête `Deprecation` et `Sunset` au moins 90 jours avant.
- **EF-5** — Client natif simulé (test) : inscription par mot de passe auprès de Supabase local, obtention du jeton, `GET /me`, `GET /home`, création idempotente (`POST /formations` avec `Idempotency-Key`, rejeu → même ressource), discussion du tuteur en flux (mode `LLM_MODE=mock`), jeton expiré → rafraîchissement puis succès ; aucune requête n'envoie d'en-tête `Origin` ni de cookie.
- **EF-6** — La page `/_dev/sdd/SPEC-1301` exécute le client natif simulé côté serveur et affiche chaque étape (nom, statut HTTP, durée) et le résultat global.

## 6. Exigences techniques

- **ET-1** — `packages/contracts/src/openapi.ts` : `components.securitySchemes` et `security` par route ; `openapi:check` et `@readme/openapi-parser` valident le document.
- **ET-2** — `apps/api/src/cors.ts` : middleware Hono appliqué avant le montage des routes ; la liste vient de `ALLOWED_ORIGINS` (`parseAllowedOrigins`, existant) plus l'origine du web (`NEXT_PUBLIC_APP_URL`).
- **ET-3** — `packages/api-client/src/sse.ts` : lecteur de flux UI message stream v1 (format de l'AI SDK utilisé par le web), sans dépendance à React ; tests sur un flux enregistré.
- **ET-4** — `packages/testing/src/native-client.ts` : scénario EF-5 réutilisable par les tests et la démonstration ; s'exécute avec `fetch` de Node sans `Origin`.
- **ET-5** — Aucune modification des routes existantes : seuls l'OpenAPI, CORS et le client changent.

## 7. Comportements attendus et cas limites

- **CL-1** — Requête préliminaire d'une origine non autorisée → 204 sans en-tête CORS (le navigateur bloquera) ; aucune exécution de route.
- **CL-2** — Rafraîchissement du jeton en échec → l'erreur 401 d'origine est remontée, sans boucle.
- **CL-3** — Flux SSE interrompu par le réseau → `streamTutorReply` lève une erreur typée `STREAM_INTERRUPTED` après avoir livré les parties reçues.
- **CL-4** — Client natif qui envoie un `Origin` (WebView) → soumis à la garde d'origine comme un navigateur (ADR-0340 §6).
- **CL-5** — Jeton valide d'un compte en cours de suppression → routes `freshAuth` refusées 401 (SPEC-1102).

## 8. Instructions d'implémentation

1. Sécurité OpenAPI et régénération. Commit `feat(SPEC-1301): déclare l'authentification dans OpenAPI`.
2. CORS. Commit `feat(SPEC-1301): autorise les origines web déclarées`.
3. Mode jeton et lecteur SSE de `@learny/api-client`. Commit `feat(SPEC-1301): donne au client d'API un mode jeton et le flux du tuteur`.
4. Client natif simulé, politique de version. Commit `test(SPEC-1301): prouve l'API avec un client natif simulé`.
5. Démonstration, e2e, visuel ; `validate.mjs` ; `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `apps/api/src/cors.ts`, `apps/api/test/integration/cors.test.ts`, `apps/api/test/integration/native-client.test.ts`, `packages/api-client/src/{token,sse}.ts` et tests, `packages/testing/src/native-client.ts`, `apps/web/components/sdd-demos/spec-1301.tsx`, `apps/web/e2e/specs/p13/spec-1301.spec.ts`.
- **Modifiés** : `packages/contracts/src/openapi.ts`, `apps/api/openapi.json`, `apps/api/src/app.ts`, `packages/api-client/src/client.ts`, `docs/architecture/api.md`, `apps/web/app/%5Fdev/sdd/registry.ts`, `packages/contracts/src/dev-migration.ts` (route de démonstration).

## 10. Interface et conformité visuelle

Mode `demo`. `/_dev/sdd/SPEC-1301` : `h1` « Client natif simulé » ; liste ordonnée `data-testid="spec-1301-steps"` (« Inscription », « Profil », « Accueil », « Création idempotente », « Rejeu idempotent », « Discussion en flux », « Rafraîchissement du jeton ») avec statut et durée ; synthèse `spec-1301-result` (« Toutes les étapes réussies »). Bouton « Rejouer ». Contrôles : jetons, structure, axe, captures desktop et mobile ≤ 1 % (durées masquées).

## 11. Critères d'acceptation

- **CA-1** — Le document OpenAPI est valide et chaque route `auth: 'user'` déclare `bearerAuth` ou `cookieAuth`.
- **CA-2** — Le client natif simulé réussit toutes les étapes d'EF-5 sans cookie ni `Origin`.
- **CA-3** — CORS : origine autorisée → en-têtes attendus ; origine non autorisée → aucun en-tête, route non exécutée.
- **CA-4** — `streamTutorReply` restitue les parties du flux dans l'ordre et lève `STREAM_INTERRUPTED` sur coupure.
- **CA-5** — La démonstration affiche les sept étapes réussies.

## 12. Plan de tests

- **Unitaires** — `packages/api-client/src/token.test.ts`, `describe('[SPEC-1301] token mode')` : en-tête, rafraîchissement unique (CA-2) ; `packages/api-client/src/sse.test.ts`, `describe('[SPEC-1301] tutor stream reader')` (CA-4) ; `packages/contracts/src/openapi.test.ts` (cas `[SPEC-1301]`) (CA-1).
- **Intégration** — `apps/api/test/integration/native-client.test.ts`, `describe('[SPEC-1301] native client')` (CA-2) ; `apps/api/test/integration/cors.test.ts`, `describe('[SPEC-1301] cors')` (CA-3).
- **End-to-end** — `apps/web/e2e/specs/p13/spec-1301.spec.ts`, `test('rejoue le client natif simulé @SPEC-1301')` (CA-5), vidéo.
- **Visuel** — `test('démonstration du client natif @SPEC-1301 @visual')` (CA-5).
- **Non-régression** — `[SPEC-201]`, `@SPEC-610`, `[SPEC-1102]`, `@SPEC-202`, suite e2e complète.

| Critère | Tests |
|---|---|
| CA-1 | unitaire OpenAPI ; `openapi:check` |
| CA-2 | unitaire jeton ; intégration client natif |
| CA-3 | intégration CORS |
| CA-4 | unitaire flux |
| CA-5 | e2e ; `@visual` |

## 13. Preuves attendues

`evidence/SPEC-1301/` : rapports, vidéo, captures, journal du client natif simulé (étapes, statuts, sans jeton), extrait OpenAPI des schémas de sécurité, `checks.json`, `acceptance.md`.

## 14. Définition de terminé

Conditions communes, plus : `openapi:check` vert et aucun changement de contrat des routes existantes (diff OpenAPI limité aux sections de sécurité).

## 15. Décisions et hypothèses

ADR-0339 (clients natifs Expo, spécifiés après la piste), ADR-0340 (Bearer, CORS). Décision : la politique de version de `/api/v1` est fixée ici car elle conditionne les clients natifs, qui ne se mettent pas à jour en même temps que le serveur. Aucune question ouverte.
