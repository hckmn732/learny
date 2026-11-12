# SPEC-208 — critères d'acceptation

Mesures du 2026-11-12 sur la pile Supabase locale, base réinitialisée depuis les migrations de la
branche (dont `0030_rate_limits_injected_clock`, ADR-0258), horloge figée ADR-0047 et IA
`LLM_MODE=mock`. Preuves : `unit.json` (36 tests `[SPEC-208]`), `integration.json` (31 tests
`[SPEC-208]`), `e2e.json` et les vidéos de `video/`. Aucune adresse IP n'est écrite en clair ; les
clés de seau sont `user:<uuid>:<profil>` ou `ip:<hmac sur 32 hex>:<profil>`. Les maquettes n'ont pas
été modifiées.

- ✅ **CA-1** — Les trois profils appliquent exactement leur capacité et leur recharge : 121ᵉ requête
  `default` refusée avec `Retry-After: 1`, recharge de 60 jetons en 30 s, en-têtes `RateLimit-*`.
  Preuve : intégration `[SPEC-208] protections API — seau Postgres` « accepts exactly 120 requests
  then refuses the 121st with Retry-After 1 », « refills 60 tokens in 30 s, never above the capacity »
  (60 acceptées après +30 s, 120 au plus après +1 h), « applies the AI refill of one token every 3
  seconds and the auth one every 6 » (Retry-After 3 et 6), « counts down the remaining whole tokens »
  (119, 118, 117) ; niveau route, « limits a learner to 120 requests on the default profile » et
  « limits the public authentication profile per address » (`RateLimit-Limit: 10`, restant 9 à 0, 429
  `RATE_LIMITED` « Vous avez envoyé trop de requêtes. Réessayez dans 6 s. », `Retry-After: 6`) ;
  unitaires `[SPEC-208] seau à jetons` (profils, recharge linéaire bornée, `Retry-After`).
  E2E `@SPEC-208` : rafales « 120 acceptées, 1 refusées, Retry-After 1 s », « 20 … 3 s », « 10 … 6 s ».
- ✅ **CA-2** — Sous 50 requêtes concurrentes, le nombre d'acceptations égale la capacité du profil,
  sans jeton négatif persisté.
  Preuve : intégration « accepts exactly the capacity under 50 concurrent requests, no negative token » :
  50 requêtes sur un seau `ai` plein → 20 acceptées, 30 refusées (`test-results/spec-208-concurrency.json`),
  jetons persistés entre 0 et 1 (la contrainte `tokens >= 0` de la table n'a jamais été violée).
- ✅ **CA-3** — Une mutation d'origine étrangère ou sans `Origin` ni `Sec-Fetch-Site: same-origin` est
  refusée 403 `ORIGIN_REJECTED` sans consommer de jeton ; les routes exemptées passent.
  Preuve : unitaires `[SPEC-208] origine` (origine exacte, liste `ALLOWED_ORIGINS`, 8 origines piégées dont
  `https://app.exemple.fr.attaquant.com`, `Sec-Fetch-Site`, méthodes sûres, exemptions webhooks,
  `/api/inngest` et `POST /api/v1/email/unsubscribe`) ; intégration `[SPEC-208] protections API —
  origine` « refuses a foreign origin with 403 ORIGIN_REJECTED, before the limiter takes a token » (le
  seau de l'apprenant est inchangé), absence d'`Origin`, `cross-site`, origine d'apparence, mutation
  acceptée avec l'origine de l'application ou `same-origin`, webhook sans `Origin` accepté.
  E2E : « Mutation même origine » → 200, « Mutation origine étrangère » → 403 `ORIGIN_REJECTED`.
- ✅ **CA-4** — La purge supprime les clés d'idempotence et seaux de plus de 24 h et conserve ceux de
  23 h 59.
  Preuve : intégration `[SPEC-208] protections API — purge` (24 h + 1 s supprimé, 24 h pile et 23 h 59
  conservés, clés et seaux) ; `[SPEC-208] purge horaire` : la fonction Inngest `security-purge`,
  déclenchée par `cron/hourly-tick` (idempotence `event.data.tickAt`), supprime les lignes périmées ;
  registre `[SPEC-203]` : déclencheur et idempotence vérifiés. E2E : « Clés d'idempotence supprimées : 2 »,
  « Seaux supprimés : 3 ».
- ✅ **CA-5** — Aucune IP en clair n'est stockée ni journalisée ; une panne de base renvoie 503 sans
  exécuter la route.
  Preuve : unitaires (clé HMAC de 32 hexadécimaux, sans l'adresse) ; intégration « stores no address in
  clear, only the keyed hash » (aucun seau ne contient l'adresse), « stores and logs no address in
  clear » (sortie de journal sans l'adresse), « refuses with SERVICE_UNAVAILABLE, never accepts, when the
  database fails » et « answers 503 and never runs the route when the limiter cannot reach the
  database » (route non exécutée) ; « ignores X-Forwarded-For without TRUST_PROXY » (seau commun
  `ip:unknown:auth`). Coût du limiteur (ET-8) : p95 = 3,1 ms sur 500 consommations
  (`test-results/spec-208-limiter-overhead.json`, seuil de la spécification : 5 ms, plafond 20 ms).
- ✅ **CA-6** — La page SDD démontre rafales, origine et purge ; vidéo, axe et captures desktop/mobile
  ≤ 1 %.
  Preuve : e2e `rafale, origine et purge @SPEC-208` (vidéo `video/`, capture
  `screenshots/…spec-208-protections.png`), e2e visuel `protections conformes @SPEC-208 @visual`
  (ordre des trois régions, jetons : fond `#F4F4F1`, cartes `#FFFFFF`, bordure `#E7E6E1`, rayon 24 px,
  Inter et Space Grotesk, `toHaveScreenshot` desktop et mobile) ; axe sans violation serious/critical.
  Non-régression : intégration `[SPEC-201]` (24) et `[SPEC-202]` (23) rejouées avec les protections
  actives, e2e `@SPEC-201` et `@SPEC-202` verts.

Écarts à la spécification, justifiés dans l'ADR-0258 : la limitation par utilisateur est prise après
l'authentification (un appel anonyme à une route protégée reste un 401 sans jeton) ; la migration
`0030_rate_limits_injected_clock` retire le déclencheur `set_updated_at` de `rate_limits` (il écrasait
l'horloge injectée) ; `X-Forwarded-For` n'est lu qu'avec `TRUST_PROXY=true`, sinon les profils par
adresse partagent le seau `ip:unknown` (Next n'expose pas l'adresse du socket) ; le code `ORIGIN_REJECTED`
remplace `ORIGIN_NOT_ALLOWED` ; les tests d'intégration de la limitation sont aussi sous
`apps/web/test/integration` car `handler` vit dans `apps/web`.
