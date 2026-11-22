# Périmètre — SPEC-2206 (domaines Billing & Entitlements et Privacy & Accounts)

Source unique : `api/inventory.json`, filtré sur `context ∈ {billing, privacy}`. L'inventaire fait
foi (ADR-2005, ADR-1001) : il contient **8 opérations** (4 `billing`, 4 `privacy`) et **aucune route
spéciale**. Le titre du plan P22 annonce « 12 opérations + dev-billing 4 » ; l'écart est expliqué
ci-dessous et consigné dans l'`acceptance.md`.

## Opérations du périmètre (liste cochable)

| Fait | Opération | Méthode | Chemin | Implémentation TS |
|---|---|---|---|---|
| [ ] | `billing.checkout` | POST | `/api/v1/billing/checkout` | `services/src/billing/checkout.ts` |
| [ ] | `billing.portal` | POST | `/api/v1/billing/portal` | `services/src/billing/checkout.ts` |
| [ ] | `billing.subscription` | GET | `/api/v1/billing/subscription` | `services/src/billing/checkout.ts` |
| [ ] | `billing.webhook` | POST | `/api/v1/webhooks/stripe` | `services/src/billing/webhook.ts` |
| [ ] | `me.export.request` | POST | `/api/v1/me/export` | `services/src/personal-data/export.ts` |
| [ ] | `me.export.read` | GET | `/api/v1/me/exports/:id` | `services/src/personal-data/export.ts` |
| [ ] | `me.deletion.schedule` | POST | `/api/v1/me/deletion` | `services/src/personal-data/deletion.ts` |
| [ ] | `me.deletion.cancel` | DELETE | `/api/v1/me/deletion` | `services/src/personal-data/deletion.ts` |

État de la bascule : 0/8 `py`, 8/8 `ts` au démarrage.

## Cas d'usage appelés par les jobs (portés ici, branchés au worker en SPEC-2207)

Le plan P22 nomme explicitement trois cas d'usage du périmètre dont la logique appartient à ce
contexte, même si les consommateurs (`data-export`, `account-deletion`, `exports-purge`) restent à
`ts` jusqu'à SPEC-2207 :

- `learny.privacy.application.export_job.run_data_export` — job `data-export` (15 min), étapes
  `load → collect → zip → upload → finalize → notify`, idempotence par `exportId` ;
- `learny.privacy.application.deletion.run_account_deletions` — `cron/nightly`, 50 profils dus,
  étapes `deletion:<uid>:<step>` reprises par l'état persisté ;
- `learny.privacy.application.purge.purge_exports` — `cron/nightly`, purge des archives expirées
  de plus de 24 h.

Le webhook Stripe (`billing.webhook`) est une route **publique** : sa preuve d'origine est la
signature `Stripe-Signature` du corps brut (`api/ownership.yaml` : `auth: public`, `rateLimit:
none`), jamais l'origine HTTP ; `api/ownership.yaml` garde donc `billing.webhook` hors du garde
d'origine (`/api/v1/webhooks/*`, SPEC-208).

## Écarts entre le plan et l'inventaire

1. **« 12 opérations »** : le plan compte probablement les 4 routes de démonstration `dev-billing`
   (`dev.stripe.checkoutPay`, `dev.stripe.checkoutCancel`, `dev.stripe.simulate`,
   `dev.stripe.events`) et les 4 routes `dev.personal-data.*`. Elles appartiennent au contexte
   `dev` de l'inventaire et à **SPEC-2207** (`api/inventory.json` : `spec: SPEC-2207`, `gap:
   true`) : elles restent `ts` et ne sont pas du périmètre de bascule de SPEC-2206.
2. **Acceptation légale** : la table `legal_acceptances` est citée par la mission mais l'opération
   `me.legal.accept` est du contexte `identity` et déjà servie par Python (SPEC-2201,
   `learny.identity.application.legal`) ; les requêtes `legal_acceptances` restent donc dans
   `learny.identity`, et `learny.privacy` les lit pour l'export sans les réécrire.

## Tests TypeScript à porter (`evidence/SPEC-2001/test-port-map.md`)

| Test TS | Nb | Cible pytest |
|---|---|---|
| `packages/services/src/billing/config.test.ts` | 3 | `tests/unit/billing/test_config.py` |
| `packages/services/src/billing/mock-stripe.test.ts` | 8 | `tests/unit/billing/test_mock_stripe.py` |
| `packages/services/src/billing/status.test.ts` | 8 | `tests/unit/billing/test_status.py` |
| `packages/services/src/billing/stripe-client.test.ts` | 6 | `tests/unit/billing/test_stripe_client.py` |
| `packages/services/src/personal-data/services.test.ts` | 14 | `tests/unit/privacy/test_services.py` |
| `packages/services/src/personal-data/zip-layout.test.ts` | 5 | `tests/unit/privacy/test_zip_layout.py` |
| `packages/services/test/integration/billing.test.ts` | 16 | `tests/integration/billing/test_billing.py` |
| `packages/services/test/integration/personal-data.test.ts` | 6 | `tests/integration/privacy/test_personal_data.py` |

S'y ajoutent les tests de domaine comparés au TypeScript par oracle `tsx` (entitlements, statuts,
signature, arborescence ZIP, téléchargeabilité) et les noms uniques imposés par la suite.

## Parité

Groupes `billing` et `privacy` du harnais `pnpm parity:record|check --group <ctx>` (Hono `:3112`,
façade `:3101`/`:3113`). Le webhook est couvert par une signature rejouée depuis le mode mock ; les
routes à paramètre de chemin (`me.export.read`) sont prouvées par l'intégration et les scénarios de
parité.
