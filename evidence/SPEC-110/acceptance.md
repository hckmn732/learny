# SPEC-110 — critères d'acceptation

Tous les critères ont été vérifiés sur la base Supabase locale (migrations `0018_ai_billing` et
`0019_ai_billing_rules`), avec l'horloge de référence 2026-11-11T12:20:00Z, `LLM_MODE=mock` et
`DATABASE_URL` local. Preuves : `checks.json`, `unit.json`, `integration.json`, `e2e.json`,
`e2e.xml`, `summary.md`, `sql-constraints.txt`, `sql-spend.txt`, `sql-rls.txt`,
`sql-redaction.txt`, `screenshots/`, `attachments/` (axe), `video/` et `baselines.md`.

- ✅ CA-1 — Les quatre tables (`ai_credentials`, `ai_task_models`, `ai_calls`, `subscriptions`),
  leurs cinq énumérations propres (`ai_provider`, `credential_status`, `ai_task`,
  `ai_call_status`, `subscription_status`), les colonnes, FK, index, contraintes, déclencheurs et
  politiques correspondent à `data-model.md` §9 ; aucune colonne de clé brute n'existe et le
  repository refuse un champ textuel de clé. Preuves :
  `packages/db/src/schema/ai-billing.test.ts` (`[SPEC-110] AI billing schema` : cinq énumérations,
  colonnes exactes, `cost_usd numeric(12,6)`, `daily_cap_usd numeric(12,6)`, pk
  `(user_id, task)`, index `(user_id, created_at)`, FK `on delete set null`, contraintes nommées,
  refus de `apiKey`/`rawKey`/clé textuelle avant toute écriture) ;
  `packages/db/test/integration/ai-billing.test.ts` tests « CA-1 — les quatre tables, cinq
  énumérations, contraintes, index, déclencheurs et politiques existent » (types réels, défaut
  `1.5`, `set_updated_at`, `ai_task_models_credential_owner`, vue et fonction) et « CA-1 / CL-2 —
  les contraintes SQL refusent coûts, tokens, latence, clés et plafonds invalides » (SQLSTATE
  23514 sur `ai_calls_cost_usd_check`, `ai_calls_input_tokens_check`,
  `ai_calls_latency_ms_check`, `ai_credentials_key_required_check`,
  `ai_credentials_encrypted_key_check`, `ai_credentials_key_last4_check`,
  `subscriptions_daily_cap_usd_check` ; 22P02 sur un statut inconnu) ;
  `sql-constraints.txt` (catalogue réel des tables, énumérations, CHECK, FK, index, politiques,
  déclencheurs, vue et fonction `security definer`) et `sql-redaction.txt` (0 colonne `key`,
  `api_key`, `raw_key`, `secret` ou `plaintext_key`).
- ✅ CA-2 — La vue/fonction `ai_spend_today` exclut les appels BYOK et non facturés, respecte le
  jour civil de `profiles.timezone` à minuit et au changement d'heure, et conserve les deux coûts
  d'appels simultanés. Preuves : `packages/db/test/integration/ai-billing.test.ts` test « CA-2 /
  ET-3 / CL-3 / CL-4 / CL-6 — la dépense suit le jour local de Paris, minuit et les bornes UTC »
  (0,05 + 0,40 + 0,10 + 0,20 = 0,75 USD ; BYOK 0,50 et refus à coût nul exclus ; bornes incluses
  et exclues ; deux appels au même instant additionnés ; vue à 0,33 USD sur l'horloge courante),
  test « CA-2 / CL-5 / CL-6 — changement d'heure et changement de fuseau du profil » (automne
  25 h : 0,30 USD ; printemps 23 h : 0,12 USD ; bascule Paris/New York : 0,25 puis 0,00 puis
  0,25 USD, `created_at` UTC inchangé) et test « ET-3 / ET-4 — la vue ai_spend_today applique aussi
  la RLS du propriétaire » (une seule ligne, 0,42 USD). `sql-spend.txt` reproduit les mêmes
  résultats SQL (0,750000 ; 0,300000 ; 0,120000 ; 0,000000 après changement de fuseau) ;
  `sql-constraints.txt` montre la fonction `security definer` et la vue `ai_spend_today`.
- ✅ CA-3 — Les objets publics ne sérialisent jamais `encrypted_key` ; un second utilisateur ne lit
  ni clé, ni appel, ni abonnement, et la fonction de dépense ne rend pas la dépense d'autrui.
  Preuves : `packages/db/src/schema/ai-billing.test.ts` test « CA-3 / ET-5 — la projection publique
  ne sérialise jamais le chiffré » (clés exactement `provider`, `label`, `keyLast4`, `status`,
  `outsideEu` ; ni `encryptedKey`, ni `Uint8Array`, ni octets dans le JSON) ; test
  `packages/db/test/integration/ai-billing.test.ts` « CA-3 / CL-7 / ET-2 — le chiffré reste en base,
  la projection publique ne le contient jamais » (marqueur `learny-test-only` présent uniquement
  dans `bytea`, absent du DTO et de `getCredentialSecret` côté public) et test « CA-3 / CL-8 — deux
  JWT ne lisent ni n'écrivent les clés, appels et abonnements de l'autre » (lectures filtrées,
  secret étranger `null`, écritures d'appel et d'abonnement en 42501, mise à jour étrangère sans
  ligne, dépense étrangère à 0). `sql-redaction.txt` (44 octets chiffrés, marqueur uniquement dans
  le bytea) et `sql-rls.txt` (1 clé et 1 appel visibles contre 0 pour l'autre compte ; 42501 sur
  les écritures client ; dépense étrangère 0).
- ✅ CA-4 — Un abonnement neuf a le plafond 1,50 USD et un statut parmi les cinq autorisés ; un
  coût négatif est rejeté. Preuves : `packages/db/test/integration/ai-billing.test.ts` test « CA-4
  — un abonnement neuf a le plafond 1,50 USD et les cinq statuts autorisés » (défaut `none`,
  `daily_cap_usd = 1.500000`, passage à `active` avec 2,25 USD, `hasActiveSubscription` vrai avant
  la fin de période seulement) et test « CA-1 / CL-2 — les contraintes SQL refusent coûts, tokens,
  latence, clés et plafonds invalides » (coût `-0.000001` et plafond 0 en 23514) ;
  `packages/db/src/schema/ai-billing.test.ts` test « CA-4 / CL-2 — un coût, un plafond ou une
  latence négatifs sont refusés » (`costUsdSchema`, `dailyCapUsdSchema`, `normalizeUsd`, NaN et
  Infinity refusés) ; `sql-constraints.txt` (`subscriptions_daily_cap_usd_check`,
  `ai_calls_cost_usd_check`, unicités Stripe).
- ✅ CA-5 — La page `/_dev/sdd/SPEC-110` présente les clés masquées, les cinq tâches, la dépense et
  l'abonnement, passe axe, produit une vidéo et les captures desktop/mobile à 1 %. Preuves :
  `apps/web/e2e/specs/p1/spec-110.spec.ts` test « inspecte les coûts IA @SPEC-110 » (titre H1,
  quatre régions dans l'ordre, deux cartes `•••• a1b2`/`•••• c3d4`, statuts `qualifiée`/`en échec`,
  région UE/hors UE, aucun marqueur chiffré dans le corps, cinq tâches dont la clé DeepSeek non
  qualifiée remplacée par l'IA fournie, dépense `$0.59`, plafond `$1.50`, abonnement `actif` et fin
  de période `11/12/2026`, mention d'absence de paiement réel) et test « coûts IA conformes
  @SPEC-110 @visual @mobile » (jetons, structure, police Inter, région défilante à 390 px, axe,
  capture de référence) ; `e2e.json` (3 tests réussis, 6 vidéos), `attachments/*-axe.json`
  (aucune violation serious/critical), `screenshots/`, `video/`, lignes de base
  `apps/web/e2e/__screenshots__/p1/spec-110.spec.ts/spec-110-ai-billing-desktop-linux.png` et
  `…-mobile-linux.png` (≤ 1 %), et `baselines.md` (ligne de base SPEC-101 régénérée pour les deux
  migrations ajoutées).
