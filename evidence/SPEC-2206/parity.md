# Parité — SPEC-2206 (billing et privacy)

Environnement : VM de dev (`ubuntu@100.111.204.24`), worktree
`learny-wt-SPEC-2206`, base locale `postgresql://postgres:postgres@127.0.0.1:54322/postgres`,
horloge figée au 2026-11-11T12:20:00Z (ADR-0047), `STRIPE_MODE=mock`, `LLM_MODE=mock`.

## Groupes du harnais `parity:record|check`

`tools/parity/scenarios/` ne contient **aucun scénario** pour les groupes `billing` et `privacy` :
`corepack pnpm parity:record --group billing|privacy` n'a donc rien à enregistrer, et
`parity:check` n'a rien à rejouer. Ce n'est pas une régression de cette spécification : les scénarios
de parité de la piste Python ont été écrits pour les contextes portés en SPEC-2201 → 2205, et ces
deux contextes n'en avaient pas. Constat consigné ici plutôt qu'un enregistrement inventé (ADR-2008).

Conséquence : la parité de ce périmètre est prouvée par les **vecteurs d'oracle** (enregistrés depuis
le TypeScript par `tools/oracles/billing-privacy-vectors.mts`, rejoués en pytest à égalité stricte) et
par les **tests d'intégration** ci-dessous, ce qui couvre CA-2 et CA-3 sans dépendre du harnais.

Reprise possible (facultatif) : ajouter `tools/parity/scenarios/billing/*.json` et
`.../privacy/*.json` (requêtes signées en mode mock, `me.export.read` avec un identifiant
d'enregistrement) puis `parity:record --group … --target http://127.0.0.1:3112` contre Hono et
`parity:check` contre la façade `:3101`/`:3113`.

## Matrice entrée → cas d'usage → règles → tables → tests

| Opération | Cas d'usage | Règles | Tables | Preuves |
|---|---|---|---|---|
| `billing.checkout` | `learny.billing.application.checkout.start_checkout` | EF-1, CL-5, CL-6, CL-8 | `subscriptions`, `profiles` | `tests/integration/billing/test_billing.py::test_the_whole_checkout_cycle_opens_then_cancels_the_subscription`, `...::test_external_return_paths_are_refused_before_any_write`, `test_billing_domain_vectors.py` |
| `billing.portal` | `open_portal` | EF-2 | `subscriptions` | `...::test_the_portal_needs_a_stripe_customer_then_returns_the_settings_tab` |
| `billing.subscription` | `get_subscription` | EF-3, BR-PLA-05 | `subscriptions` | `...::test_the_whole_checkout_cycle…`, `test_billing_domain_vectors.py` (statuts) |
| `billing.webhook` | `learny.billing.application.webhook.handle_webhook` | EF-4, ET-5, CL-1…CL-3, CL-9, ADR-0215, ADR-2031 | `stripe_events`, `subscriptions`, `event_outbox` | `...::test_a_replayed_delivery_has_a_single_effect`, `...::test_an_invalid_signature_writes_nothing`, `...::test_an_older_event_never_overwrites_a_newer_state`, `...::test_an_unknown_customer_is_acknowledged_without_creating_a_user` |
| `me.export.request` | `learny.privacy.application.export.request_export` | EF-1, CL-1, CL-2 | `data_exports`, `profiles`, `event_outbox` | `tests/integration/privacy/test_personal_data.py::test_an_export_is_queued…`, `...::test_three_exports_per_local_day_then_the_limit` |
| `me.export.read` | `get_export`, `download_export` | EF-2, CL-4, CL-5 | `data_exports` (RLS) | `...::test_an_export_is_queued_then_downloadable_only_for_its_owner` (404 autrui, 410 expiré, URL 600 s) |
| `me.deletion.schedule` | `learny.privacy.application.deletion.schedule_deletion` | EF-5, CL-7, BR-ACC-11 | `profiles` | `...::test_scheduling_and_cancelling_a_deletion_are_idempotent` |
| `me.deletion.cancel` | `cancel_deletion` | EF-6 | `profiles` | `...::test_scheduling_and_cancelling_a_deletion_are_idempotent`, `...::test_an_account_is_deleted_only_once_due…` |
| job `data-export` | `run_data_export` (`collect_export_data`) | EF-1…EF-4, ET-2, ET-3 | `data_exports` + 20 tables sous RLS | `...::test_an_export_is_queued…`, `test_services.py`, `test_zip_layout.py`, `test_privacy_domain_vectors.py` |
| job `account-deletion` | `run_account_deletions`, `run_account_deletion` | EF-7, CL-7…CL-9, ADR-0216/0267 | `profiles`, `formations`, `groups`, `resources`, `ai_calls`, `auth.users` | `...::test_an_account_is_deleted_only_once_due_and_after_a_cancellation_nothing_happens` |
| job `exports-purge` | `purge_exports` | EF-8 | `data_exports` | `...::test_the_purge_keeps_a_recent_expiration`, `test_an_export_is_queued…` |

## Divergences

Aucune divergence non expliquée sur les vecteurs d'oracle (13 tests de domaine) ni sur les tests
d'intégration. Deux écarts assumés et documentés :

- **Vérification de signature** : le schéma documenté par Stripe est porté avec l'horloge injectée au
  lieu de `Webhook.construct_event` (ADR-2031) ; les issues et les codes sont identiques.
- **Archive** : `zipfile` remplace `archiver`, les entrées et leur ordre sont identiques
  (vecteurs) ; seuls l'horodatage interne des entrées et le niveau de compression peuvent différer,
  sans effet observable sur le contenu.
