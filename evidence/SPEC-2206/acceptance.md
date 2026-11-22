# Acceptation — SPEC-2206 (Billing & Entitlements et Privacy & Accounts)

État au 2026-11-22, branche `spec/SPEC-2206-domaines-facturation-confidentialite`.
Dernier commit de code : `6204d19a`. **Livraison partielle assumée** : le code et les tests Python
sont verts, la parité contractuelle par vecteurs et l'intégration sont prouvées ; il reste la page de
démonstration SDD et les tests Playwright (`@SPEC-2206`, `@visual`) avant `validate.mjs`/`complete.mjs`.

## Critères d'acceptation

- **CA-1 — périmètre basculé** ❌ partiel. Les **8 opérations** `billing` (4) et `privacy` (4) sont à
  `py` dans `api/ownership.yaml` (commit `1c1236bb`, handlers dans le même commit, `test_handlers`
  vert) et les **cas d'usage des trois jobs** du périmètre sont portés (`run_data_export`,
  `run_account_deletions`, `purge_exports`) et testés. La matrice `parity.md` est complète.
  *Reste* : rien côté code ; la case passera ✅ après la validation complète.
- **CA-2 — parité contractuelle** ✅ avec réserve documentée. Aucun scénario `billing`/`privacy`
  n'existe dans `tools/parity/scenarios` (constat dans `parity.md`) ; la parité est prouvée par les
  vecteurs d'oracle enregistrés depuis le TypeScript et rejoués à égalité stricte
  (`tests/unit/billing/test_billing_domain_vectors.py`, `tests/unit/privacy/test_privacy_domain_vectors.py`,
  13 tests) et par 14 tests d'intégration.
- **CA-3 — tests TS portés** ✅. Les huit fichiers cibles de `test-port-map.md` existent et passent :
  `test_config.py` (3), `test_status.py` (8), `test_mock_stripe.py` (8), `test_stripe_client.py` (6),
  `test_zip_layout.py` (5), `test_services.py` (11), `test_billing.py` (8),
  `test_personal_data.py` (6). Total périmètre : **55 tests** (41 unitaires + 14 intégration).
- **CA-4 — contrats et adaptateurs** ✅. `ruff`, `mypy`, `lint-imports` verts (contrat « Nobody
  imports views or apps » + « Billing and privacy domains are pure ») ; les handlers ne portent
  aucune règle et `PRIVILEGED_CALLERS` déclare chaque transaction de service avec son motif.
- **CA-5 — e2e existants** ❌ non exécuté. *Reste* : page `/_dev/sdd/SPEC-2206` + entrée registre,
  `apps/web/e2e/specs/p22/spec-2206.spec.ts` (un `@SPEC-2206` et un `@SPEC-2206 @visual`), variables
  d'environnement de la façade dans `apps/web/playwright.config.ts` (`STRIPE_MODE=mock`).

## Preuves exécutées (2026-11-22)

| Commande | Résultat |
|---|---|
| `uv run ruff check .` | ✅ « All checks passed! » |
| `uv run ruff format --check packages-py apps` | ✅ |
| `uv run mypy packages-py apps` | ✅ 536 fichiers |
| `uv run lint-imports` | ✅ 2 contrats conservés |
| `uv run pytest packages-py/learny/tests/unit apps/api-py/tests/unit -q` | ✅ 3535 réussis |
| `flock … uv run pytest …/integration/billing …/integration/privacy -q` | ✅ 14 réussis |
| `corepack pnpm exec tsx tools/oracles/billing-privacy-vectors.mts --check` | ✅ vecteurs à jour |

## Reprise

1. Page de démonstration `apps/web/app/_dev/sdd/SPEC-2206/` + entrée registre (style `spec-2204.tsx`,
   chiffres lus dans `api/inventory.json` et `api/ownership.yaml`).
2. `apps/web/e2e/specs/p22/spec-2206.spec.ts` : un test `@SPEC-2206` (2-3 opérations `py` via le web
   et la façade, `x-served-by: learny-api`, mutation POST avec `headers: { origin:
   'http://127.0.0.1:3100' }` et `cookie: session.cookieHeader`) et un `@SPEC-2206 @visual`
   (axe + captures desktop/mobile).
3. `STRIPE_MODE=mock` dans l'environnement de la façade de `apps/web/playwright.config.ts`.
4. `export DATABASE_URL=… ; PLAYWRIGHT_REUSE_SERVER=0 node tools/sdd/validate.mjs SPEC-2206` puis
   `node tools/sdd/complete.mjs SPEC-2206 --no-merge --no-push`.
