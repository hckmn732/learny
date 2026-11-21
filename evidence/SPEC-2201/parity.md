# Parité — SPEC-2201 (état au dernier commit de la branche)

Environnement : VM de dev, worktree `/home/ubuntu/projects/learny-wt-SPEC-2201`, branche
`spec/SPEC-2201-domaines-identite-formation`, base Supabase locale (`127.0.0.1:54322`).
Horloge des tests : `2026-11-11T12:20:00Z` (ADR-0047). Aucune valeur théorique : chaque ligne
renvoie à un test exécuté.

## Opérations identity (13 servies par Python)

| Opération | Cas d'usage Python | Tables lues/écrites | Tests | État |
|---|---|---|---|---|
| `me.get` | `identity.get_me` → `read_me` | profiles | `test_me_preferences.py` (2), sortie validée par `MeGetOutput` | ✅ `py` |
| `me.update` | `identity.update_profile` | profiles | `test_me_preferences.py` (2) | ✅ `py` |
| `me.preferences.get` | `identity.get_preferences` | study_preferences | `test_me_preferences.py` (1) | ✅ `py` |
| `me.preferences.update` | `identity.update_preferences` | study_preferences | `test_me_preferences.py` (2) | ✅ `py` |
| `me.onboarding.get` | `identity.get_onboarding_state` | profiles, study_preferences, notification_settings, automation_settings | `test_onboarding.py` (1) | ✅ `py` |
| `me.onboarding.update` | `identity.advance_onboarding` | profiles, ai_credentials, ai_task_models, notification_settings, automation_settings, event_outbox | `test_onboarding.py` (6) | ✅ `py` |
| `me.legal.accept` | `identity.accept_legal_versions` | legal_acceptances, profiles | `test_legal.py` (4) | ✅ `py` |
| `me.profile.get` | `identity.get_settings_state` | profiles, study_preferences, data_exports, formations | `test_profile_settings.py` (6) | ✅ `py` |
| `me.profile.update` | `identity.update_settings_profile` | profiles, study_preferences | `test_profile_settings.py` (6) | ✅ `py` |
| `me.ai.task-models.update` | `identity.assign_task_model` | ai_credentials, ai_task_models | `test_ai_models.py` (5) | ✅ `py` |
| `header.get` | `views.header.get_header` | profiles, formations, groups, group_members, notifications | `test_sidebar_header.py` (2) | ✅ `py` |
| `sidebar.get` | `identity.get_sidebar` (via `views.sidebar`) | profiles, formations, modules, notion_states, notions, daily_activity | `test_sidebar_header.py` (5) | ✅ `py` |
| `sidebar.update` | `identity.update_sidebar` | profiles, formations, groups, group_members | `test_sidebar_header.py` (3) | ✅ `py` |

## Opérations identity encore `ts` (6)

| Opération | Motif | Décision |
|---|---|---|
| `auth.magicLink`, `auth.resend`, `auth.signIn`, `auth.signOut`, `auth.signUp` | `Set-Cookie` d'`@supabase/ssr` non comparable : aucun enregistrement de parité ni vecteur `supabase-cookies` dans `api/oracles`, et `pnpm parity:check` n'existe pas dans `package.json` | ADR-2022 |
| `home.get` | dépend de `calculateRetention` et `buildDailySession` (`packages/learning-engine`), affectés à SPEC-2202 | ADR-2023 |

## Ce qui est prouvé dans cette branche

| Sujet | Preuve | Résultat |
|---|---|---|
| Cas d'usage identity (profil, rythme, onboarding, légal, réglages, menu, en-tête, modèles IA) | `uv run pytest packages-py/learny/tests/integration/identity -q` | ✅ 41 cas sur la base locale, transaction annulée |
| Dérivations pures (sigle, accent, jours civils, fuseau, e-mail abrégé) | `packages-py/learny/tests/unit/identity/test_views_helpers.py` | ✅ 7 cas |
| Raffinements de contrat perdus par la génération | `apps/api-py/tests/unit/test_validate.py` | ✅ 11 cas (champ requis, unicité, rappels/`depart`, fuseau IANA, `trim`, `null` refusé) |
| Couverture des handlers | script de contrôle : `HANDLERS` = exactement les 13 entrées `py` de `api/ownership.yaml`, aucune entrée `ts` | ✅ 13 / 13 |
| Sorties conformes au contrat | `MeGetOutput`, `MeUpdateOutput`, `MePreferencesGetOutput`, `MeOnboardingGetOutput`, `MeOnboardingUpdateOutput`, `MeLegalAcceptOutput`, `MeProfileGetOutput`, `MeProfileUpdateOutput`, `MeAiTaskModelsUpdateOutput`, `HeaderGetOutput`, `SidebarGetOutput`, `SidebarUpdateOutput` validés dans les tests | ✅ |
| Suite complète | `flock /tmp/learny-sdd-db.lock uv run pytest packages-py apps -q` | ✅ 474 tests (60 ajoutés par la bascule identity) |
| Lint, format, types | `uv run ruff check .`, `uv run ruff format --check packages-py apps`, `uv run mypy packages-py apps` | ✅ verts |
| Artefacts de contrat | `node tools/contract/generate-py-contract.mjs --check` | ✅ à jour (aucune modification de `generated/`) |
| Inventaire | `corepack pnpm exec tsx tools/migration/inventory.mjs` | ✅ inchangé (217 opérations, 32 routes spéciales) |

## Parité contractuelle : ce qui n'a pas pu être mesuré

`pnpm parity:check --group identity` n'a **pas** été exécuté : `package.json` ne définit pas de script
`parity:*` (le plan P20 les cite, `tools/parity/run.ts` existe mais aucun scénario n'est enregistré
pour `identity`, et le runner exige un serveur Hono et un serveur cible). Aucune divergence n'est
donc « déclarée expliquée » par ce mécanisme. À défaut, la conformité est mesurée par :

1. les modèles générés (`generated/models.py`, jamais édités) qui valident chaque sortie dans les tests ;
2. les raffinements explicites de `apps/api-py/src/learny_api/validate.py`, alignés sur Zod ;
3. la comparaison des textes `locale_fr` avec leurs littéraux TypeScript, recopiés au mot près.

## Écarts connus et assumés

1. **`starts_with` non généré** (déjà signalé) — sans effet sur identity, concerne les codes
   d'invitation (`LRN-`) du contexte formation.
2. **Raffinements Zod absents du schéma OpenAPI** — `datamodel-codegen` ne porte ni `.refine(...)`,
   ni `.trim()`, ni le contrôle IANA. Ils sont réappliqués après le modèle généré par
   `validate.REFINEMENTS` (mêmes messages, mêmes chemins, statut 400) :
   `me.update`, `me.profile.update`, `me.preferences.update`, `me.onboarding.update`,
   `me.ai.task-models.update`, `me.legal.accept`, `sidebar.update`. Les valeurs sont en outre
   `trim()`ées avant écriture, comme le fait Zod.
3. **Objet non strict vs `extra="forbid"`** — vérifié : les corps `z.object` (profil, préférences,
   onboarding, menu) sont générés **sans** `extra="forbid"` : Pydantic ignore les clés inconnues,
   exactement comme Zod les strippe. Les `z.strictObject` (acceptation légale) portent
   `extra="forbid"` et refusent, comme Zod.
4. **Optionnel vs nullable** — le générateur rend un champ `.optional()` par `T | None = None` :
   un `null` explicite est donc accepté et écrit en base là où Zod répondrait 400. Cas résiduels
   (`firstName`, `lastName`, `collapsed`, `currentFormationId`) : les `null` du menu et des versions
   légales sont refusés par les raffinements ; un `null` sur un nom de profil reste accepté et
   l'efface. Le client web n'envoie jamais `null` ; à corriger dans le générateur (hors périmètre de
   cette spécification, aucune assertion d'oracle touchée).
