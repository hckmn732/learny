# Preuve — client Bearer externe simulé (SPEC-2301, EF-4)

**Date** : 2026-11-23. **Environnement** : pile Playwright locale (`PLAYWRIGHT_REUSE_SERVER=0`),
façade Python sur le port 3101, Hono sur 3112, PostgreSQL et Supabase locaux, horloge figée
2026-11-11T12:20:00Z (ADR-0047), `LLM_MODE=mock`. Ce n'est **pas** une mesure de staging.

## Test exécuté

`apps/web/e2e/specs/p23/spec-2301.spec.ts`, test `un client Bearer externe est servi par la façade
Python @SPEC-2301` :

```bash
PLAYWRIGHT_REUSE_SERVER=0 corepack pnpm test:e2e --grep "@SPEC-2301\b"
# 2 passed (50.0s) : le test Bearer et le test @visual
```

Ce que le test prouve, sans aucun cookie :

1. `GET /api/v1/billing/subscription` avec `Authorization: Bearer <jeton Supabase réel>` → **200**,
   en-tête **`x-served-by: learny-api`** (la façade Python a servi l'opération, pas Hono) et aucun
   `set-cookie` (le client externe n'obtient pas de session).
2. Sans jeton ni cookie, la même opération → **401 `UNAUTHENTICATED`** : le 200 précédent vient bien
   du jeton.
3. `POST /api/v1/billing/checkout` authentifié **par cookie** mais **sans `Origin`** → **403
   `ORIGIN_REJECTED`** (SPEC-208 ET-5) : aucune mutation cookie-authentifiée ne passe sans origine.
4. La même mutation avec l'en-tête d'origine de la pile → la garde passe, la réponse n'est plus un
   403 et porte `x-served-by: learny-api`.

## Jeton utilisé

La pile tourne sur l'instant figé (ADR-0047). GoTrue signe un jeton fraîchement émis avec un `iat`
réel, que le vérificateur de la façade refuse **à raison** (il compare `exp`, `nbf` et `iat` à
l'horloge injectée, ADR-1007). Le test fabrique donc le jeton du client externe avec
`SUPABASE_JWT_SECRET` du stack local et les mêmes revendications que GoTrue (`sub`, `email`,
`aud: authenticated`, `role: authenticated`, `iss: <SUPABASE_URL>/auth/v1`, `iat` et `exp` sur
l'instant figé, `email_confirmed_at`) : c'est un jeton HS256 réel, accepté par le même vérificateur
et rejeté sans le secret. Aucune assertion de sécurité n'a été modifiée ; le commentaire du test
explique pourquoi.

`packages/testing/src/supabase.ts` expose désormais `accessToken` dans `TestSession` (ajout additif,
utilisé par ce test).

## Non prouvé ici

Un jeton émis par GoTrue en temps réel, contre le staging : **bloqué externe** avec CA-1/CA-2
(ADR-2009). Le chemin de vérification est le même ; seule l'horloge diffère.
