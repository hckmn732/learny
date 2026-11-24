---
id: SPEC-3003
title: Client d'API, session sécurisée et cache hors ligne
phase: P30
priority: mobile
depends_on: [SPEC-3001]
business_rules: [BR-ACC-07, BR-PLA-08]
screens: []
adrs: [ADR-1005, ADR-1007, ADR-1009, ADR-3004, ADR-3005, ADR-3008]
visual: demo
---

# SPEC-3003 — Client d'API, session sécurisée et cache hors ligne

## 1. Objectif

Brancher l'application sur l'API `/api/v1` : instance de `@learny/api-client` avec Bearer,
renouvellement du jeton, flux SSE par `expo/fetch`, session Supabase stockée chiffrée, TanStack
Query avec cache persistant, gestion du réseau et traduction des erreurs. Toutes les
spécifications d'écran s'appuient sur ce socle.

## 2. Contexte

Lire ADR-1005 (Bearer prioritaire, pas d'`Origin` pour les clients natifs), ADR-3008 (session,
stockage, renouvellement), ADR-3004 §3 (données), canevas `docs/architecture/mobile/README.md` § 4
et § 6, `docs/architecture/api.md` §1 (erreurs `problem+json`, pagination, idempotence, limitation)
et §3 (stabilité de `/api/v1` pour les clients natifs). Le paquet `packages/api-client/src/`
fournit `client.ts` (en-têtes injectables, conversion des erreurs, renouvellement unique),
`sse.ts` (lecture du flux du tuteur) et `token.ts`. La démonstration SPEC-1301 prouve déjà un
scénario de client natif sans cookie.

## 3. Dépendances

- **SPEC-3001** : application, configuration, horloge, outillage de test.
- Bibliothèques : `@supabase/supabase-js`, `expo-secure-store`, `react-native-mmkv`,
  `@tanstack/react-query`, `@tanstack/query-async-storage-persister` (adaptateur MMKV),
  `@react-native-community/netinfo`, `expo-crypto` (UUID), `expo/fetch`.
- API locale et Supabase local (`pnpm dev:up`, seed de démonstration) pour l'intégration.

## 4. Règles métier couvertes

- BR-ACC-07 — `src/lib/dates.ts` formate toute date dans le fuseau de l'utilisateur lu sur `/me`
  (repli `Europe/Paris`), jamais dans celui de l'appareil ; testé avec un appareil en
  `America/New_York`.
- BR-PLA-08 — Le client respecte la limitation de débit (`429` → attente `Retry-After`, aucune
  rafale de tentatives), envoie `Idempotency-Key` sur les créations, `X-Request-Id` sur chaque
  requête, ne stocke aucun jeton en clair et n'envoie ni cookie ni `Origin`.

## 5. Exigences fonctionnelles

- **EF-1** — `src/auth/supabase.ts` crée le client Supabase avec le stockage
  `secureSessionStorage` (ADR-3008 §2) ; `src/auth/session.tsx` expose `useSession()` :
  `{ status: 'loading' | 'signedOut' | 'signedIn', userId, accessToken() }`.
- **EF-2** — `src/api/client.ts` crée l'instance `api-client` : `baseUrl` =
  `EXPO_PUBLIC_API_URL + '/api/v1'`, `fetch` = `expo/fetch`, fournisseur d'en-têtes ajoutant
  `Authorization: Bearer`, `X-Request-Id` (UUID) et `Accept-Language: fr`.
- **EF-3** — Après un `401`, un seul `refreshSession()` puis une seule nouvelle tentative ; en cas
  de nouvel échec, déconnexion locale, purge (EF-6) et retour à la connexion avec le message
  « Votre session a expiré. Reconnectez-vous. » (libellé ajouté à `mobile.session`).
- **EF-4** — `src/data/query-client.ts` : TanStack Query (`staleTime` 30 s, `gcTime` 24 h, 2
  tentatives sur erreur réseau, aucune sur 4xx), rafraîchissement au premier plan et au retour du
  réseau, cache persisté dans MMKV chiffrée (clé de cache par utilisateur, version du schéma de
  cache = version de l'application).
- **EF-5** — `src/offline/network.ts` : état réseau ; `Banner` « Hors ligne · affichage des
  données enregistrées » (libellé `mobile.offline.banner`) monté par la coquille (SPEC-3102).
- **EF-6** — `purgeUserData()` : vide le cache Query, la persistance MMKV et la file hors ligne
  (créée vide ici, remplie par SPEC-3305).
- **EF-7** — `src/api/errors.ts` : `messageFor(error)` renvoie le message français du code
  (`@learny/i18n`), sinon un message générique « Une erreur est survenue. Réessayez. » ; `429`
  produit « Trop de requêtes. Réessayez dans N s. ».
- **EF-8** — `src/api/stream.ts` : `streamTutorReply(conversationId, body, signal)` s'appuie sur
  `sse.ts` de `api-client` et produit les parties `text-delta`, `data-sources`,
  `data-follow-ups`, `data-self-test` ; l'annulation coupe la connexion.
- **EF-9** — Page `/_dev/sdd/SPEC-3003` : connexion du compte de démonstration (mot de passe du
  seed lu dans `.env.e2e`, jamais affiché), appel de `/me`, affichage du prénom, d'un flux SSE de
  démonstration (`GET /dev/sdd/relay-stream`, trois fragments) et de l'état du cache.

## 6. Exigences techniques

- **ET-1** — `secureSessionStorage` implémente l'interface de stockage de Supabase (`getItem`,
  `setItem`, `removeItem`) sur MMKV chiffrée ; la clé de chiffrement (32 octets de
  `expo-crypto`) est créée au premier lancement et stockée dans `expo-secure-store`.
- **ET-2** — Le renouvellement est sérialisé (une seule promesse de renouvellement en cours) pour
  éviter des renouvellements concurrents quand plusieurs requêtes reçoivent `401`.
- **ET-3** — `useIdempotencyKey(intentId)` : clé UUID conservée en mémoire (et dans la file hors
  ligne pour les intentions persistées) jusqu'au succès de la mutation.
- **ET-4** — Aucun jeton ni corps de requête n'est journalisé ; Sentry (si configuré) filtre
  `Authorization`.
- **ET-5** — `api-client` n'est modifié que par ajouts rétrocompatibles (ADR-3005) ; si
  `sse.ts` exige `response.body` en flux, aucun contournement par polyfill : `expo/fetch` est la
  seule implémentation admise.

## 7. Comportements attendus et cas limites

- **CL-1** — Dix requêtes reçoivent `401` simultanément : un seul appel de renouvellement, puis
  dix nouvelles tentatives.
- **CL-2** — Jeton de renouvellement révoqué : déconnexion locale, purge, écran de connexion.
- **CL-3** — Réseau coupé pendant un flux SSE : `StreamInterruptedError` remontée ; le texte
  partiel reste affiché (traité par SPEC-3303).
- **CL-4** — Application tuée puis relancée hors ligne : la session est restaurée depuis le
  stockage chiffré et les écrans déjà visités s'affichent depuis le cache.
- **CL-5** — Mise à jour de l'application changeant le schéma de cache : le cache persistant est
  ignoré et reconstruit (pas de plantage).
- **CL-6** — Trousseau iOS inaccessible (appareil verrouillé au démarrage en arrière-plan) : la
  lecture échoue proprement, nouvelle tentative au premier plan.

## 8. Instructions d'implémentation

1. Écrire `secure-storage.ts` puis `supabase.ts` et `session.tsx` avec leurs tests.
2. Écrire `api/client.ts` (instance, en-têtes, renouvellement sérialisé) et `api/errors.ts`.
3. Écrire `data/query-client.ts`, la persistance MMKV et `offline/network.ts`.
4. Écrire `api/stream.ts` et vérifier le flux de démonstration sur émulateur.
5. Écrire `lib/dates.ts` (formatage dans le fuseau de l'utilisateur).
6. Écrire la page `/_dev/sdd/SPEC-3003`, le flux Maestro et les tests d'intégration.

## 9. Fichiers et composants concernés

- **Créés** — `apps/mobile/src/auth/{secure-storage,supabase,session}.ts(x)`,
  `apps/mobile/src/api/{client,errors,stream}.ts`, `apps/mobile/src/data/{query-client,keys}.ts`,
  `apps/mobile/src/offline/{network,purge}.ts`, `apps/mobile/src/lib/dates.ts`,
  `apps/mobile/app/_dev/sdd/SPEC-3003.tsx`, tests associés,
  `apps/mobile/e2e/flows/SPEC-3003-session.yaml`.
- **Modifiés** — `packages/i18n/src/fr/mobile.ts` (créé s'il n'existe pas : espaces `session`,
  `offline`, `errors`), `apps/mobile/app/_layout.tsx` (fournisseurs).
- **Lus** — `packages/api-client/src/*`, `packages/contracts/src/me.ts`, `packages/core`.

## 10. Interface et conformité visuelle

Mode `demo` : `/_dev/sdd/SPEC-3003` avec `testID` `sdd-session-status`, `sdd-me-firstname`
(« Alex »), `sdd-stream` (concaténation des trois fragments), `sdd-cache-status`, et le `Banner`
hors ligne quand le réseau est coupé. Flux visuel : capture de la page connectée, comparée à la
ligne de base versionnée ; contrôle des jetons du `Banner` (fond, texte, icône).

## 11. Critères d'acceptation

- **CA-1** — Le compte de démonstration se connecte, `/me` renvoie « Alex » avec le Bearer, sans
  cookie ni `Origin` (vérifié dans le journal de requêtes de l'API locale).
- **CA-2** — Un `401` provoque un seul renouvellement et une seule nouvelle tentative, y compris
  pour dix requêtes concurrentes ; un renouvellement refusé déconnecte et purge.
- **CA-3** — Le flux SSE de démonstration est reçu fragment par fragment sur l'émulateur.
- **CA-4** — Après redémarrage hors ligne, la session et les données en cache sont disponibles et
  le bandeau hors ligne est affiché.
- **CA-5** — Aucune valeur de session n'est stockée en clair (test du stockage).

## 12. Plan de tests

- **Unitaires** — Vitest `[SPEC-3003]` : `secure-storage.test.ts` (chiffrement, absence de clair),
  `client.test.ts` (en-têtes, renouvellement sérialisé, 429, idempotence), `errors.test.ts`,
  `dates.test.ts` (fuseau utilisateur vs appareil), `stream.test.ts` (parties, annulation). Jest
  `[SPEC-3003]` : `session.test.tsx` (états), `offline-banner.test.tsx`. Couvre CA-2, CA-5.
- **Intégration** — Vitest `[SPEC-3003]` `apps/mobile/test/integration/session.int.test.ts` :
  connexion par mot de passe contre Supabase local, `/me` en Bearer, renouvellement après
  expiration simulée, absence d'`Origin`. Couvre CA-1, CA-2.
- **End-to-end** — Maestro `@SPEC-3003` `SPEC-3003-session.yaml` (vidéo) : connexion sur la page
  de démonstration, prénom affiché, flux reçu, passage en mode avion, redémarrage, bandeau hors
  ligne et données conservées. Couvre CA-1, CA-3, CA-4.
- **Visuel** — `@SPEC-3003 @visual` : page connectée et bandeau hors ligne. Couvre CA-4.
- **Non-régression** — `[SPEC-3001]`, `[SPEC-3002]`, tests existants de `packages/api-client`.

| Critère | Tests |
|---|---|
| CA-1 | session.int, SPEC-3003-session.yaml |
| CA-2 | client.test, session.int |
| CA-3 | stream.test, SPEC-3003-session.yaml |
| CA-4 | SPEC-3003-session.yaml, flux visuel |
| CA-5 | secure-storage.test |

## 13. Preuves attendues

`evidence/SPEC-3003/` : `acceptance.md`, rapports, vidéo, captures, extrait du journal de l'API
locale montrant le Bearer sans `Origin` (jetons masqués).

## 14. Définition de terminé

Définition commune adaptée par ADR-3004 ; `validate.mjs SPEC-3003` vert ; tests de
`packages/api-client` inchangés et verts.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-1005, ADR-1007, ADR-1009, ADR-3004, ADR-3005, ADR-3008.
- Le cache persistant est par utilisateur et purgé à la déconnexion ; aucune donnée d'un compte
  n'est visible par un autre compte sur le même appareil.
