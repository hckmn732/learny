# Parité — SPEC-2201 (identity + formation)

Référence : `api/oracles/recordings/reads.json` (SPEC-2001), rejouée par
`corepack pnpm exec tsx tools/parity/run.ts`. Les scénarios générés couvrent chaque lecture sans
paramètre de chemin de l'inventaire, plus les mutations de `tools/parity/scenarios/mutations.json`.

## Méthode

1. `pnpm parity:record --target http://127.0.0.1:3112` enregistre la réponse de Hono (source de
   vérité TypeScript) pour chaque scénario.
2. `pnpm parity:check --target http://127.0.0.1:3101` rejoue les mêmes scénarios contre la façade
   Python : les entrées `py` sont servies par Python, les `ts` sont relayées à Hono.
3. Comparaison sémantique : statut, en-têtes de la liste `COMPARED_HEADERS`, corps JSON après
   normalisation des UUID, des instants et des adresses (CL-2).
4. `--group identity` et `--group formation` restreignent l'enregistrement et le rejeu à un
   contexte ; les autres groupes du fichier restent intacts.

## Contexte identity

| Opération | Cas d'usage | Règles | Tables | Tests | Parité |
|---|---|---|---|---|---|
| `header.get` | `learny.views.header.get_header` | BR-NAV-01 | profiles, formations, groups, group_members, notifications | `integration/identity/test_sidebar_header.py` | scénario `header.get` |
| `sidebar.get` | `learny.identity.application.sidebar.get_sidebar` | BR-FOR-11 | profiles, formations, modules, notion_states, daily_activity | `integration/identity/test_sidebar_header.py` | scénario `sidebar.get` |
| `sidebar.update` | `…update_sidebar` | BR-FOR-11 | profiles | `test_sidebar_header.py`, `test_validate.py` | mutation idempotente |
| `me.get` / `me.update` | `…get_me` / `…update_profile` | BR-PRO-01 | profiles, study_preferences | `integration/identity/test_me_preferences.py` | scénario `me.get` |
| `me.preferences.*` | `…get_preferences` / `…update_preferences` | BR-ACC-08 | study_preferences | `test_me_preferences.py` | scénario `me.preferences.get` |
| `me.onboarding.*` | `…get_onboarding_state` / `…advance_onboarding` | SPEC-602 | profiles, notification_settings, automation_settings | `test_onboarding.py` | scénario `me.onboarding.get` |
| `me.profile.*` | `…get_settings_state` / `…update_settings_profile` | SPEC-618 | profiles, formations | `test_profile_settings.py` | scénario `me.profile.get` |
| `me.legal.accept` | `…accept_legal_versions` | SPEC-806 | legal_acceptances, profiles | `test_legal.py` | mutation idempotente |
| `me.ai.task-models.update` | `…assign_task_model` | BR-IA-02 | ai_task_models | `test_ai_models.py` | mutation idempotente |

## Contexte formation (25 opérations basculées)

| Opération | Cas d'usage | Règles | Tables | Tests | Parité |
|---|---|---|---|---|---|
| `formations.list` | `learny.formation.application.cadrage.list_formations` | BR-FOR-01 | formations | `integration/formation/test_cadrage.py` | scénario `formations.list` |
| `formations.create` | `…cadrage.create_formation` | BR-FOR-01, BR-FOR-03, ADR-0162 | formations, cadrage_messages, profiles | `test_programme.py` | e2e `@SPEC-2201` |
| `formations.update` | `…cadrage.update_formation_title` | ADR-0162 | formations | `test_cadrage.py` | mutation idempotente |
| `cadrage.get` / `cadrage.page` | `…cadrage.get_cadrage_state` / `…get_cadrage_page_state` | SPEC-604 EF-1 | formations, cadrage_messages | `test_cadrage.py` | lecture sans paramètre |
| `cadrage.message` | `…cadrage.post_cadrage_message` | SPEC-604 EF-5 à EF-9, CL-1, CL-6 | cadrage_messages, formations | `test_programme.py`, `test_cadrage.py` | e2e, fixture `cadrage-sap-*` |
| `cadrage.complete` | `…cadrage.complete_cadrage` | SPEC-604 EF-10, CA-5, CA-6 | formations, event_outbox | `test_cadrage.py` | événement `formation/cadrage-completed` |
| `formations.access` | `…formations.can_access_formation` | SPEC-615 ET-1, CL-1 | formations, groups, group_members | `test_management.py` | 204 sans corps |
| `formations.pause` / `formations.archive` | `…pause_formation` / `…archive_formation` | BR-FOR-15, ADR-0016 | formations, schedule_slots, profiles, event_outbox | `test_management.py` | mutation idempotente |
| `formations.current` | `…switch_current_formation` | BR-FOR-11, ADR-0075 | formations, profiles | `test_management.py` | e2e SPEC-304/618 |
| `formations.group.get` / `.create` | `…groups.get_formation_group` / `…create_formation_group` | BR-GRP-01, BR-GRP-03 | groups, group_members, group_member_progress | `test_groups.py` | mutation idempotente |
| `groups.rotateCode` / `.members.remove` / `.leave` | `…groups.rotate_group_code` / `…remove_member_from_group` / `…leave_formation_group` | BR-GRP-05, BR-APP-03 | groups, group_members, formations, modules, chapters, notions, module_progress… | `test_groups.py` | mutation idempotente |
| `invitations.get` / `.accept` | `…groups.get_invitation_preview` / `…accept_invitation` | BR-GRP-01, ADR-0246 | groups, formations, group_members, module_progress | `test_groups.py` | 404 sans fuite, `LRN-XXXX` normalisé |
| `programme.get` | `…programme.get_programme_state` | SPEC-605 ET-1, SPEC-606 ET-3 | programme_proposals, modules, chapters, notions, module_progress | `test_read_models.py` | lecture sans paramètre |
| `programme.generate` | `…generate_proposal` | SPEC-605 EF-1, BR-FOR-04 | programme_proposals, formations | `test_programme.py` | fixture `programme-sap` |
| `programme.adjust` | `…adjust_proposal` | SPEC-605 EF-3 | programme_proposals, programme_change_requests | `test_programme.py` | fixture `programme-adjust` |
| `programme.import` | `…import_proposal` | SPEC-605 EF-2, CL-5 | programme_imports, programme_proposals | `test_programme.py`, `test_import_file.py` | fixture `programme-import` |
| `programme.validate` | `…validate_proposal` | SPEC-605 EF-4, CA-1, CA-3 | modules, chapters, notions, module_progress, event_outbox | `test_programme.py` | événement `formation/programme-validated` |
| `notionGraph.get` | `…notion_graph.get_notion_graph` | BR-CAR-01 à 05, ADR-0307 | notions, notion_states, notion_links, resources, course_sections | `test_read_models.py` | lecture sans paramètre |
| `search.global` | `…search.search_user_content` | BR-NAV-05, ADR-0217 | `search_user_content()`, notions, course_sections, formations | `test_read_models.py` | scénario `search.global` |

`formations.resume` reste `ts` : elle dépend du planificateur de SPEC-2202 (ADR-2024). Elle est
relayée à Hono, donc la parité de la façade est identique et les e2e SPEC-618 passent sans
modification.

## Résultat

Exécution du 21 novembre 2026, base locale remise à zéro (`pnpm db:reset --yes` sous `flock`),
Hono sur `:3112`, façade Python sur `:3101` :

```
$ pnpm parity:record --target http://127.0.0.1:3112 --group identity --group formation
Recorded 9 scenarios against http://127.0.0.1:3112

$ pnpm parity:check --target http://127.0.0.1:3101 --group identity --group formation
Parity OK: 9 scenarios replay identically against http://127.0.0.1:3101.
```

Les neuf scénarios sont `header.get`, `home.get`, `me.get`, `me.onboarding.get`,
`me.preferences.get`, `me.profile.get`, `sidebar.get` (identité) et `formations.list`,
`search.global` (formation). **Zéro divergence inexpliquée** : les entrées `py` sont servies par
Python, les entrées `ts` (`home.get`, `auth.*`) sont relayées à Hono et comparées à l'identique.

### Divergences corrigées, et non contournées

| Constat | Correction |
|---|---|
| Six lectures d'identité « object shape differs » avec des clés identiques | l'ordre des clés JSON différait entre les deux sérialiseurs ; `normalizeBody` trie désormais les clés (l'ordre n'est pas un contrat, CL-2) dans `tools/parity/run.ts` |
| Aucune option de filtrage par contexte | ajout de `--group <context>` à `tools/parity/run.ts`, et des scripts `parity:record` / `parity:check` dans `package.json` |
| Une mutation `py` appelée depuis le navigateur était refusée `ORIGIN_REJECTED` | la façade ne recevait ni `API_PROXY_SECRET` ni `TRUST_PROXY` dans la pile e2e ; l'entrée `webServer` de la façade les déclare comme celle de Hono (`apps/web/playwright.config.ts`) |

`api/oracles/recordings/reads.json` a été réenregistré par l'outil (jamais édité à la main) pour les
deux groupes ; les autres groupes du fichier sont conservés.
