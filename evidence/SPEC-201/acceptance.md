# SPEC-201 — critères d'acceptation

Mesures du 2026-11-12 sur la pile Supabase locale (`pnpm dev:up`), horloge figée ADR-0047 et IA
`LLM_MODE=mock`. Les sessions des tests sont de vraies sessions Supabase (utilisateur créé par l'API
admin, connexion par mot de passe, cookies `@supabase/ssr`) : `createTestSession` de
`@learny/testing/supabase`. Preuves : `unit.json` (49 tests `[SPEC-201]`), `integration.json` (29 tests
`[SPEC-201]`), `e2e.json` et les vidéos de `video/`. Les maquettes n'ont pas été modifiées.

- ✅ **CA-1** — Toute erreur de validation renvoie 400 `application/problem+json` conforme à
  `ProblemDetails`, avec `errors[].path` préfixé et `X-Request-Id` identique à `requestId`.
  Preuve : intégration `[SPEC-201] handler` « answers 400 problem+json with prefixed paths on a
  validation error (CA-1) » (`body.message`, en-tête = champ `requestId`, corps parsé par le schéma
  `ProblemDetails`) et « answers 400 on invalid JSON and 413 above 1 MiB » (`body`) ; unitaires
  `validate.test.ts` (préfixes `params.`, `query.`, `body.`) et `request-id.test.ts` (reprise d'un
  identifiant conforme, UUID pour `<script>`, 500 caractères, trop court). E2E `@SPEC-201` : la carte
  « Validation » affiche `VALIDATION_FAILED`, 400, `body.message` et `requestId`.
  Mesure du surcoût du wrapper (ET-11, hors service, session simulée, 200 appels après 5 d'échauffement) :
  p95 = 0,713 ms pour un seuil de 15 ms (`test-results/spec-201-wrapper-overhead.json`, écrit par
  l'intégration « adds less than 15 ms at p95 around the service »).
- ✅ **CA-2** — Un POST idempotent rejoué avec la même clé renvoie le même statut et le même corps
  (`counter` inchangé) avec `Idempotent-Replayed: true` ; deux requêtes concurrentes produisent
  exactement une exécution.
  Preuve : intégration `[SPEC-201] idempotence` « replays the recorded answer without running the
  service again » (`devEchoExecutions() = 1`, corps égaux), « replays a recorded 4xx answer
  identically », « runs a service once for two concurrent requests with the same key » (une seule
  exécution, statuts 201 ou 409) et « answers 409 IDEMPOTENCY_IN_PROGRESS with Retry-After while the
  first call runs » (déterministe, `Retry-After: 1`, puis rejeu du 201, une seule exécution) ; « releases
  the key after a 5xx » (CL-3) et « treats a key older than 24 h as absent » (CL-4, horloge avancée de
  24 h 1 min). E2E `@SPEC-201` : second envoi `Idempotent-Replayed : oui` avec le même `counter`.
- ✅ **CA-3** — Clé réutilisée pour un autre corps → 422 `IDEMPOTENCY_KEY_REUSED` ; clé absente ou
  invalide → 400 `IDEMPOTENCY_KEY_REQUIRED`.
  Preuve : intégration « refuses a key reused with another body, without calling the service » (422,
  service non rappelé) et « requires a valid Idempotency-Key » (absente, trop courte, caractères
  interdits : 400, aucune exécution).
- ✅ **CA-4** — La pagination parcourt 57 éléments en 3 pages (20, 20, 17) puis `nextCursor = null` ;
  `limit=101` et un curseur forgé → 400.
  Preuve : intégration `[SPEC-201] pagination` « walks 57 items in pages of 20, 20 and 17 » (57
  identifiants distincts de `item-57` à `item-01`), « refuses limit=101, limit=0, a forged cursor and
  an unreadable cursor » (`query.limit`, `query.cursor`), « gives an empty page, never a 500, for the
  cursor of another list » (CL-9) ; unitaires `cursor.test.ts` (aller-retour, curseur forgé → `null`).
  E2E `@SPEC-201` : 20, 40 puis 57 éléments chargés, bouton « Page suivante » retiré.
- ✅ **CA-5** — Une route `auth: 'user'` sans session → 401 `UNAUTHENTICATED` ; une sortie non
  conforme au contrat → 500 sans fuite.
  Preuve : intégration « answers 401 UNAUTHENTICATED without a session », « answers 401 for a tampered
  session cookie », « answers 403 EMAIL_NOT_CONFIRMED when the e-mail is not confirmed », `[SPEC-201]
  contrat de sortie` « answers 500 without leaking data when the service breaks the contract »
  (le secret n'apparaît pas dans le corps) et « drops fields that are not part of the contract » ;
  e2e `@SPEC-201` « refuse un appel sans session » (401 `problem+json`, en-tête = `requestId`).
- ✅ **CA-6** — `openapi.json` est valide OpenAPI 3.1, contient chaque route du registre et
  `pnpm openapi:check` passe.
  Preuve : intégration `packages/contracts/test/integration/openapi.test.ts` (génération identique au
  fichier commité, validation par `@readme/openapi-parser`, une opération par route du registre avec
  sa sécurité, erreurs `application/problem+json`, en-tête `Idempotency-Key`, sortie déterministe) ;
  `pnpm openapi:check` ajouté à `pnpm lint` (lint ✔ dans `checks.json`). E2E : « 3 routes documentées ».
- ✅ **CA-7** — La page `/_dev/sdd/SPEC-201` déroule les démonstrations ; elle et les routes
  `dev/sdd/*` renvoient 404 quand `ENABLE_SDD_PAGES` est désactivé.
  Preuve : e2e `démonstration du socle API @SPEC-201` (validation, erreur métier 422, idempotence,
  pagination, OpenAPI ; vidéo `video/04-…` et capture `screenshots/02-…`), e2e visuel `@visual`
  (jetons : fond `#F4F4F1`, cartes blanches `#E7E6E1` rayon 24 px, Inter et Space Grotesk, ordre des 5
  cartes, `toHaveScreenshot` desktop et mobile) ; axe sans violation serious/critical ; intégration
  « serves no demonstration route when ENABLE_SDD_PAGES is disabled » (404 `problem+json`, avant toute
  authentification). La garde de la page reste celle de SPEC-006 (`proxy.ts`, test `[SPEC-006]`).
