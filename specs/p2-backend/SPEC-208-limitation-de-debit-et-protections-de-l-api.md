---
id: SPEC-208
title: Limitation de débit et protections de l'API
phase: P2
priority: V1
depends_on: [SPEC-201]
business_rules: [BR-PLA-08]
screens: []
adrs: [ADR-0042]
visual: demo
---

# SPEC-208 — Limitation de débit et protections de l'API

## 1. Objectif

Remplacer les gardes no-op posées par SPEC-201 par une limitation de débit réelle (seau à jetons persistant dans Postgres) et une vérification d'origine des mutations, puis purger les clés d'idempotence et les seaux périmés. Toute route `/api/v1` bénéficie de ces protections sans modification de son code.

## 2. Contexte

SPEC-201 a défini `RouteDef.rateLimit` (`default|ai|auth|none`), l'interface `RateLimiter` avec `setRateLimiter`, l'interface `OriginGuard` avec `setOriginGuard`, et l'ordre des gardes du wrapper `handler` (`docs/architecture/api.md` §1). SPEC-112 a créé `rate_limits` et `idempotency_keys` (`docs/architecture/data-model.md` §12). Lire ADR-0042 (sécurité applicative), ADR-0213 (paramètres du seau, clé IP, règle d'origine, purges), ADR-0120 et ADR-0206 (idempotence), ADR-0047 (horloge injectable), `docs/engineering/conventions.md` (erreurs, journalisation), `docs/architecture/overview.md` §4. Les en-têtes HTTP de sécurité (CSP, HSTS…) sont livrés par SPEC-805 ; cette spécification couvre le débit, l'origine et les purges.

## 3. Dépendances

- **SPEC-201** : `handler`, `defineRoute`, `getRateLimiter`/`setRateLimiter`, `getOriginGuard`/`setOriginGuard`, catalogue `ERROR_CATALOG`, format `problem+json`.
- **SPEC-112** (transitive par SPEC-201) : tables `rate_limits` (`bucket` pk, `tokens numeric`, `updated_at`) et `idempotency_keys`.
- **SPEC-203** (déjà terminée dans l'ordre de phase) : crons `cron/hourly-tick` et `cron/nightly`, fonctions Inngest durables, `JOBS_MODE=inline` en test.
- **SPEC-009** : schéma d'environnement ; cette spécification y ajoute `RATE_LIMIT_IP_SECRET` (≥ 32 caractères, serveur), `TRUST_PROXY` (`true|false`, défaut `false`), `ALLOWED_ORIGINS` (liste d'origines HTTPS séparées par des virgules, vide par défaut).
- **Externe** : aucune. Postgres local (Supabase CLI) suffit ; aucune bibliothèque de limitation tierce.

## 4. Règles métier couvertes

- **BR-PLA-08** : la limitation de débit est appliquée à toutes les routes selon leur profil, la vérification d'origine protège les mutations contre la falsification de requêtes inter-sites, les secrets (`RATE_LIMIT_IP_SECRET`) restent côté serveur et aucune adresse IP n'est stockée en clair. Les en-têtes de sécurité de la même règle sont livrés par SPEC-805.

## 5. Exigences fonctionnelles

- **EF-1** — Profils (ADR-0213) : `default` 120 jetons, recharge 2 jetons/s, clé utilisateur ; `ai` 20 jetons, recharge 1 jeton toutes les 3 s, clé utilisateur ; `auth` 10 jetons, recharge 1 jeton toutes les 6 s, clé IP ; `none` sans contrôle. Une route `auth: 'public'` dont le profil est `default` est limitée par IP.
- **EF-2** — Chaque requête limitée consomme un jeton. Quand le seau contient moins d'un jeton, la réponse est `429` `application/problem+json` avec `code: "RATE_LIMITED"`, `title: "Trop de requêtes"`, `detail: "Vous avez envoyé trop de requêtes. Réessayez dans {n} s."` et l'en-tête `Retry-After: n` (entier ≥ 1).
- **EF-3** — Toute réponse d'une route limitée porte `RateLimit-Limit: <capacité>` et `RateLimit-Remaining: <jetons entiers restants>` ; les réponses 429 portent en plus `Retry-After`.
- **EF-4** — Les seaux sont partagés par profil : une rafale sur `/tutor/*` épuise le profil `ai` sans toucher au profil `default` du même utilisateur.
- **EF-5** — Toute requête `POST|PUT|PATCH|DELETE` vers `/api/v1/**` est refusée `403` `ORIGIN_REJECTED` (« Requête refusée : origine non autorisée. ») si son en-tête `Origin` n'est ni l'origine de `NEXT_PUBLIC_APP_URL` ni une origine de `ALLOWED_ORIGINS`. En l'absence d'`Origin`, la requête est acceptée seulement si `Sec-Fetch-Site: same-origin`. Exemptions : `/api/v1/webhooks/*`, `/api/inngest`, `POST /api/v1/email/unsubscribe`.
- **EF-6** — La garde d'origine s'exécute avant la limitation de débit et avant toute lecture du corps ; un refus d'origine ne consomme pas de jeton.
- **EF-7** — Purge horaire : les lignes `idempotency_keys` créées depuis plus de 24 h et les seaux `rate_limits` non modifiés depuis plus de 24 h sont supprimés par la fonction `security-purge` (tick `cron/hourly-tick`), qui journalise le nombre de lignes supprimées.
- **EF-8** — La page `/_dev/sdd/SPEC-208` permet de lancer une rafale simulée sur chaque profil, montre les jetons restants, le premier 429 et son `Retry-After`, teste une mutation avec une origine étrangère et affiche le résultat de la dernière purge.

## 6. Exigences techniques

- **ET-1** — `packages/services/src/security/rate-limit.ts` exporte `RATE_PROFILES: Record<'default'|'ai'|'auth', { capacity: number; refillPerSecond: number; key: 'user'|'ip' }>` et `createPostgresRateLimiter(db, clock): RateLimiter` dont `consume({ profile, userId, ip, routeId })` renvoie `{ allowed: boolean; remaining: number; retryAfterSeconds: number | null; limit: number }`.
- **ET-2** — Consommation atomique en une seule instruction : `insert into rate_limits(bucket, tokens, updated_at) values ($b, $cap - 1, $now) on conflict (bucket) do update set tokens = least($cap, rate_limits.tokens + extract(epoch from $now - rate_limits.updated_at) * $refill) - 1, updated_at = $now where least(...) >= 1 returning tokens`. Absence de ligne retournée = refus ; un second `select` calcule `Retry-After = ceil((1 - tokensRechargés) / refill)`. `$now` provient de l'horloge injectable (jamais `now()` SQL), pour des tests déterministes.
- **ET-3** — Clé de seau : `user:<uuid>:<profil>` ou `ip:<h>:<profil>` où `h` = 32 premiers caractères hexadécimaux de `HMAC-SHA256(RATE_LIMIT_IP_SECRET, ip)`. IP = premier élément de `X-Forwarded-For` si `TRUST_PROXY=true`, sinon adresse du socket ; IP introuvable → `ip:unknown:<profil>` (seau commun, fermeture sûre).
- **ET-4** — Erreur de base pendant `consume` → `503` `SERVICE_UNAVAILABLE` (« Service momentanément indisponible. »), journalisée avec `requestId`, jamais acceptation silencieuse. `rate_limits` est accédée via `serviceDb` uniquement (opération autorisée listée dans ADR-0110) ; aucun client utilisateur n'y a accès (RLS sans politique).
- **ET-5** — `packages/services/src/security/origin-guard.ts` exporte `createOriginGuard(env): OriginGuard` ; les origines sont comparées après normalisation `new URL(x).origin`, sans joker ; `ALLOWED_ORIGINS` invalide fait échouer la validation de configuration au démarrage.
- **ET-6** — Enregistrement : `apps/web/lib/api/bootstrap-security.ts` appelle `setRateLimiter` et `setOriginGuard` au chargement du module serveur ; en `APP_ENV=test`, un test vérifie que le limiteur actif n'est pas le no-op.
- **ET-7** — Nouveaux codes dans `packages/core/src/errors.ts` : `ORIGIN_REJECTED` (403) et `SERVICE_UNAVAILABLE` (503). `RATE_LIMITED` (429) existe déjà (SPEC-201).
- **ET-8** — Performance : la consommation ajoute au plus 5 ms p95 à une requête sur Postgres local (mesuré par le test d'intégration sur 500 requêtes, consigné, sans seuil dépendant de la machine au-delà de 20 ms).

## 7. Comportements attendus et cas limites

- **CL-1** — 120 requêtes `default` à l'instant figé : les 120 passent, la 121ᵉ reçoit 429 avec `Retry-After: 1`.
- **CL-2** — Horloge avancée de 30 s après épuisement : 60 jetons disponibles exactement (recharge linéaire), jamais plus que la capacité.
- **CL-3** — 50 requêtes concurrentes sur un seau `ai` plein : exactement 20 acceptées, 30 refusées, aucun jeton négatif persisté.
- **CL-4** — Deux utilisateurs derrière la même IP : seaux `user` distincts ; seule l'authentification (profil `auth`) est partagée par IP.
- **CL-5** — Mutation sans `Origin` ni `Sec-Fetch-Site` (client non navigateur) : 403 `ORIGIN_REJECTED`, sauf routes exemptées.
- **CL-6** — Origine `https://app.exemple.fr.attaquant.com` alors qu'`app.exemple.fr` est autorisée : refus (comparaison exacte d'origine).
- **CL-7** — Webhook Stripe sans `Origin` : non bloqué par la garde (sa signature est vérifiée par SPEC-210).
- **CL-8** — `X-Forwarded-For` falsifié avec `TRUST_PROXY=false` : ignoré, l'adresse du socket est utilisée.
- **CL-9** — Purge pendant qu'une clé d'idempotence de 23 h 59 est rejouée : la clé n'est pas supprimée ; à 24 h + 1 s elle l'est et la requête est retraitée comme nouvelle (ADR-0120).
- **CL-10** — Base indisponible : 503 `SERVICE_UNAVAILABLE`, la route métier n'est pas exécutée.

## 8. Instructions d'implémentation

1. Ajouter les variables à `packages/config/src/env.ts` et `.env.example`, les codes d'erreur à `packages/core/src/errors.ts`. Commit `feat(SPEC-208): configure la limitation et l'origine`.
2. Écrire `rate-limit.ts` (profils, clé de seau, instruction atomique, calcul de `Retry-After`) et ses tests unitaires sur la formule de recharge. Commit `feat(SPEC-208): seau à jetons Postgres`.
3. Écrire `origin-guard.ts` et ses tests (origines, exemptions, `Sec-Fetch-Site`). Commit `feat(SPEC-208): vérifie l'origine des mutations`.
4. Écrire `bootstrap-security.ts`, l'enregistrer dans le wrapper, ajouter les en-têtes `RateLimit-*` au wrapper. Commit `feat(SPEC-208): active les protections dans le wrapper`.
5. Écrire la fonction Inngest `security-purge` (`packages/jobs/src/functions/security-purge.ts`, déclencheur `cron/hourly-tick`, idempotence `hourly:<tick>`). Commit `feat(SPEC-208): purge les clés et seaux périmés`.
6. Page SDD, routes de démonstration `/api/v1/dev/sdd/rate-limit/burst` et `/api/v1/dev/sdd/rate-limit/purge` (actives seulement si `ENABLE_SDD_PAGES`), tests e2e et visuels. Commit `test(SPEC-208): démontre débit et origine`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/services/src/security/{rate-limit,origin-guard,index}.ts`, `packages/services/src/security/rate-limit.test.ts`, `packages/services/src/security/origin-guard.test.ts`, `packages/services/test/integration/rate-limit.test.ts`, `packages/jobs/src/functions/security-purge.ts`, `apps/web/lib/api/bootstrap-security.ts`, `apps/web/app/api/v1/dev/sdd/rate-limit/{burst,purge}/route.ts`, `apps/web/components/sdd-demos/spec-208.tsx`, `apps/web/e2e/specs/p2/spec-208.spec.ts`.
- **Modifiés** : `apps/web/lib/api/handler.ts` (en-têtes `RateLimit-*`, import du bootstrap), `packages/core/src/errors.ts`, `packages/config/src/env.ts`, `.env.example`, `packages/jobs/src/registry.ts`, registre SDD, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `RateLimiter`, `OriginGuard`, `defineRoute` (SPEC-201), `serviceDb` (SPEC-101), crons (SPEC-203), horloge (SPEC-207).

## 10. Interface et conformité visuelle

Mode `demo` : `/_dev/sdd/SPEC-208`, `h1` « SPEC-208 — Limitation de débit et protections de l'API ». Régions dans l'ordre :
1. « Profils » (`data-testid="spec-208-profiles"`) : trois cartes `default`, `ai`, `auth` avec capacité, recharge, jetons restants (`spec-208-remaining-<profil>`) et bouton « Lancer une rafale » qui envoie capacité + 1 requêtes ; le résultat affiche « {n} acceptées, {m} refusées, Retry-After {s} s » dans une région `role="status"`.
2. « Origine » (`spec-208-origin`) : deux boutons « Mutation même origine » (attendu 200) et « Mutation origine étrangère » (attendu 403 `ORIGIN_REJECTED`, la requête étrangère est simulée côté serveur).
3. « Purge » (`spec-208-purge`) : bouton « Purger maintenant » et compteurs « Clés d'idempotence supprimées » / « Seaux supprimés ».
Composants `@learny/ui` (Card, Button, Badge), jetons de SPEC-301, utilisable au clavier et à 390 px. Contrôles visuels (`docs/engineering/testing.md` §6) : jetons vérifiés, ordre des régions, axe sans violation, captures desktop 1440 et mobile 390, écart ≤ 1 %.

## 11. Critères d'acceptation

- **CA-1** — Les trois profils appliquent exactement leur capacité et leur recharge : 121ᵉ requête `default` refusée avec `Retry-After: 1`, recharge de 60 jetons en 30 s, en-têtes `RateLimit-*` présents.
- **CA-2** — Sous 50 requêtes concurrentes, le nombre d'acceptations égale la capacité du profil, sans jeton négatif persisté.
- **CA-3** — Une mutation d'origine étrangère ou sans `Origin` ni `Sec-Fetch-Site: same-origin` est refusée 403 `ORIGIN_REJECTED` sans consommer de jeton ; les routes exemptées passent.
- **CA-4** — La purge supprime les clés d'idempotence et seaux de plus de 24 h et conserve ceux de 23 h 59.
- **CA-5** — Aucune IP en clair n'est stockée ni journalisée ; une panne de base renvoie 503 sans exécuter la route.
- **CA-6** — La page SDD démontre rafales, origine et purge ; vidéo, axe et captures desktop/mobile ≤ 1 %.

## 12. Plan de tests

- **Unitaires** — `packages/services/src/security/rate-limit.test.ts`, `describe('[SPEC-208] seau à jetons')` : recharge linéaire bornée, calcul `Retry-After`, clé de seau HMAC, IP selon `TRUST_PROXY` (CA-1, CA-5). `origin-guard.test.ts`, `describe('[SPEC-208] origine')` : origine exacte, liste, `Sec-Fetch-Site`, exemptions, origine piégée (CA-3).
- **Intégration** — `packages/services/test/integration/rate-limit.test.ts`, `describe('[SPEC-208] protections API')` : 121 requêtes sur une route de test via `handler`, horloge avancée de 30 s, 50 requêtes concurrentes, refus d'origine sans jeton consommé, purge 24 h / 23 h 59, base coupée → 503, recherche de l'IP en clair dans `rate_limits` et les journaux (CA-1 à CA-5).
- **End-to-end** — `apps/web/e2e/specs/p2/spec-208.spec.ts`, `test('rafale, origine et purge @SPEC-208')` : ouvrir la page, lancer la rafale `auth`, vérifier « 10 acceptées, 1 refusées », tester les deux mutations, purger ; vidéo (CA-6).
- **Visuel** — `test('protections conformes @SPEC-208 @visual')` : régions, jetons, axe, captures ≤ 1 % (CA-6).
- **Non-régression** — rejouer `[SPEC-201]` / `@SPEC-201` et `[SPEC-202]` / `@SPEC-202` (routes d'authentification désormais limitées).

| Critère | Tests |
|---|---|
| CA-1 | unitaires seau ; intégration 121 requêtes et recharge |
| CA-2 | intégration concurrence |
| CA-3 | unitaires origine ; intégration refus sans jeton |
| CA-4 | intégration purge |
| CA-5 | unitaires clé HMAC ; intégration 503 et recherche d'IP |
| CA-6 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-208/` : rapports Vitest et Playwright, sortie de la rafale concurrente (acceptées/refusées), mesure p95 de la consommation, extrait de `rate_limits` montrant des clés hachées, journal de purge, vidéo e2e, captures desktop/mobile, `checks.json`, `acceptance.md`.

## 14. Définition de terminé

Les validations communes de `docs/engineering/testing.md` §7 passent. En plus : le no-op de SPEC-201 n'est plus actif hors tests unitaires isolés, les suites `[SPEC-201]` et `[SPEC-202]` restent vertes avec la limitation active, et `.env.example` documente les trois nouvelles variables.

## 15. Décisions et hypothèses

- ADR-0042 : seau Postgres et vérification d'origine. ADR-0213 (créé pour cette spécification) : paramètres des profils, clé HMAC de l'IP, fermeture sûre en 503, règle d'origine et exemptions, purges horaires.
- ADR-0120 (confirmée par ADR-0219, qui remplace ADR-0206) : durée de 24 h des clés d'idempotence ; cette spécification n'en modifie pas le traitement, seulement la purge.
- Hypothèse : en production, le proxy Vercel fournit `X-Forwarded-For` fiable (`TRUST_PROXY=true` dans l'environnement géré de SPEC-013).
