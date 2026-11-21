# SPEC-2101 — Connexion PostgreSQL, identité, RLS et Storage en Python

- Date : 2026-11-21
- Branche : `spec/SPEC-2101-donnees-identite-rls`
- Dernier commit de code : `c5151d83` (les preuves sont ajoutées par le commit suivant)
- Environnement : VM de développement Ubuntu 26.04, PostgreSQL 17 local (stack Supabase), Python
  3.13.18 géré par `uv` 0.13.9, Node 24.22.3, `corepack pnpm` 10.34.9
- Horloge figée `2026-11-11T12:20:00Z` (ADR-0047), `LLM_MODE=mock` (ADR-0048)

## Critères d'acceptation

- ✅ CA-1 — La matrice RLS passe sous Python pour toutes les tables de l'inventaire.
  Preuve : `api/oracles/vectors/rls-matrix.json` (59 tables, 73 politiques, exporté de
  `packages/db/src/rls/matrix.ts` et vérifié par `pnpm rls:check`) rejoué par
  `packages-py/learny/tests/integration/shared/test_rls_matrix.py` — 5 tests : catalogue
  `pg_catalog` (RLS et FORCE RLS sur les 59 tables, politiques nommées, aucune `USING (true)`),
  isolation des 46 tables personnelles (propriétaire, membre, non-membre, insertions forgées),
  programme partagé des 7 tables (lecture membre, écriture propriétaire, révocation au départ),
  invisibilité des 6 tables de service, détection d'une politique retirée. Rapport :
  `evidence/SPEC-2101/integration.json` ; exécution locale : 5 réussis en 7,49 s.

- ✅ CA-2 — Les tests de jetons invalides et d'identité usurpée échouent proprement.
  Preuve : `packages-py/learny/tests/unit/identity/test_authenticate.py` (Bearer prioritaire, jeton
  invalide jamais recyclé en cookie, cookie refusé par le serveur Auth, repli `GET /auth/v1/user`
  quand le JWKS est inaccessible, `assert_fresh`, `LEGAL_ACCEPTANCE_REQUIRED`),
  `packages-py/learny/tests/unit/identity/test_jwt.py` (expiration comparée à l'horloge injectée,
  émetteur, audience, signature), `packages-py/learny/tests/unit/shared/test_uow.py` (`claims_json`
  identique à `buildUserClaims`, identifiant d'événement) et le test e2e
  `apps/web/e2e/specs/p21/spec-2101.spec.ts` : cookie et Bearer résolus via la façade, jeton
  forgé refusé en 401 `UNAUTHENTICATED`. Rapports : `evidence/SPEC-2101/unit.json`,
  `evidence/SPEC-2101/e2e.json` et vidéo dans `evidence/SPEC-2101/video/`.

- ✅ CA-3 — Le rôle de service n'est utilisable que par la liste fermée.
  Preuve : `learny/shared/db/privileged.py` (6 entrées justifiées) et
  `packages-py/learny/tests/unit/shared/test_privileged_callers.py` : tout module ouvrant
  `service_tx(` hors liste fait échouer le test (4 tests), le rôle de service n'est défini que dans
  l'unité de travail, et les 6 tables de service restent invisibles et non inscriptibles au client
  (test d'intégration ci-dessus). Rapport : `evidence/SPEC-2101/unit.json`.

## Gardes HTTP et Storage (plan P21, étapes 3 et 4)

- `apps/api-py/src/learny_api/guards/origin.py`, `rate_limit.py`, `idempotency.py` portent
  `origin-guard.ts`, `security.ts`, `rate-limit.ts`, `http/idempotency.ts` et le dépôt
  `idempotency.ts` ligne à ligne ; 78 cas unitaires ([SPEC-2101]).
- `learny/platform/storage.py` porte `paths.ts` et `signed-urls.ts` : chemins propriétaires, URL de
  lecture 600 s après preuve de la ligne en base, jeton d'envoi HS256 local.
- `learny/identity/infrastructure/gotrue.py` couvre les points d'entrée Auth utilisés par les
  routes TypeScript, sans SDK Supabase.

## Invariants respectés (ADR-1001, ADR-2008)

- Aucune assertion d'oracle (e2e, visuel, accessibilité, contrat HTTP) modifiée, aucune ligne de
  base visuelle régénérée, aucun libellé changé ; la page de démonstration `/_dev/sdd/SPEC-2101` et
  son test `@SPEC-2101 @visual` sont ajoutés.
- Aucune dépendance ajoutée hors ADR-2015 : `httpx`, `pyjwt`, `sqlalchemy`, `psycopg` étaient déjà
  au `uv.lock`.
- Deux écarts de parité corrigés dans le code Python, jamais dans les oracles :
  `to_problem` ne recopie plus `retry_after` dans le corps et ne fusionne `errors` que pour les
  trois codes de validation ; `jsonx.canonical` conserve les membres `null` conformément au vecteur
  généré par Node (`api/oracles/vectors/jsonx.json`).
- Code Python en anglais hors `locale_fr` (test de politique de langue vert) ; textes vus par
  l'utilisateur copiés mot pour mot dans `learny/shared/locale_fr/details.py`.

## Commandes exécutées

```bash
uv run ruff check . && uv run ruff format --check packages-py apps
uv run mypy packages-py apps            # 62 fichiers, aucun probleme
uv run pytest packages-py apps -q       # 256 reussis (254 + 2 apres la suite d'integration)
flock /tmp/learny-sdd-db.lock uv run pytest packages-py/learny/tests/integration -q
PLAYWRIGHT_REUSE_SERVER=0 corepack pnpm test:e2e --grep "@SPEC-2101\b"
node tools/sdd/validate.mjs SPEC-2101
```
