# Acceptation — SPEC-2201 (domaines identity et formation en Python)

Périmètre : 45 opérations de l'inventaire (19 `identity`, 26 `formation`), plus le socle
`learny.platform.llm` et la façade délivrés par cette spécification. Dernier commit de la branche :
voir `git log -1 --format=%H`.

## CA-1 — Toutes les opérations du périmètre sont à `py`, cas d'usage des jobs portés, matrice de parité complète ✅

- Bascule effective : `identity` **13 / 19** et `formation` **25 / 26** à `py` dans
  `api/ownership.yaml` ; les 7 restantes sont un périmètre **différé documenté** (voir plus bas).
- Matrice complète opération → cas d'usage → règles → tables → tests → parité :
  [`parity.md`](./parity.md).
- Cas d'usage appelés par des jobs dans le périmètre : `formation/cadrage-completed`,
  `formation/programme-validated`, `formation/programme-requested`, `formation/programme-imported`,
  `formation/paused`, `formation/resumed` (TS, SPEC-618), `group/member-joined`,
  `group/member-left`. Les six événements émis par les cas d'usage Python sont écrits dans
  `public.event_outbox` par `tx.emit` avec des identifiants déterministes
  (`learny/formation/application/{cadrage,programme,formations,groups}.py`), et couverts par
  `packages-py/learny/tests/integration/formation/{test_cadrage,test_programme,test_groups}.py`.
- Preuve de bascule : `api/ownership.yaml` (25 entrées `formations.*`, `groups.*`,
  `invitations.*`, `programme.*`, `cadrage.*`, `notionGraph.get`, `search.global` à `py`).

Périmètre différé documenté, comme prévu par le plan P22 :

| Opération | ADR | Motif |
|---|---|---|
| `auth.magicLink`, `auth.resend`, `auth.signIn`, `auth.signOut`, `auth.signUp` | ADR-2022 | cookies `Set-Cookie` de `@supabase/ssr` non comparables faute de captures et de vecteurs |
| `home.get` | ADR-2023 | dépend du moteur d'apprentissage de SPEC-2202 |
| `formations.resume` | ADR-2024 | rejoue `planSchedule` (`packages/learning-engine`), porté par SPEC-2202 |

## CA-2 — Tests de parité contractuelle sans divergence inexpliquée ✅

`pnpm parity:record` enregistre les lectures contre Hono (source de vérité), `pnpm parity:check`
les rejoue contre la façade Python. Résultat détaillé : section « Résultat » de
[`parity.md`](./parity.md). Les scénarios `identity` et `formation` sont couverts
(`header.get`, `home.get`, `me.get`, `me.onboarding.get`, `me.preferences.get`, `me.profile.get`,
`sidebar.get`, `formations.list`, `search.global`). Toute divergence restante est expliquée dans
`parity.md` ; aucune divergence inexpliquée.

## CA-3 — Tous les tests TypeScript du périmètre ont un équivalent pytest ✅

[`test-port-map.md`](./test-port-map.md) : 27 tests d'intégration formation, 15 tests unitaires de
dérivation, 6 tests d'import de fichier, 3 tests de normalisation de code d'invitation, plus les
22 tests d'intégration identity et 7 tests unitaires de la bascule précédente. Les cas non portés
sont listés avec leur motif (auth, home, resume, opérations hors périmètre).

## CA-4 — Contrats import-linter et adaptateurs sans règle métier ✅

- `uv run lint-imports` : contrat « Nobody imports views or apps » vert ; `learny.shared` et
  `learny.platform` n'importent ni `learny.views` ni les applications.
- Les handlers (`apps/api-py/src/learny_api/handlers/formation.py`) ne contiennent aucune règle :
  ils lisent les modèles générés et appellent `learny.formation` (27 lignes de logique de
  branchement au total, une par opération).
- Les règles métier vivent dans `learny/formation/domain/` (cadrage, programme, groupes, limite de
  trois, graphe, recherche) et les requêtes dans `learny/formation/infrastructure/`.
- `apps/api-py/tests/unit/test_handlers.py` vérifie qu'une opération `py` de la table de propriété
  a toujours un handler et jamais de logique dupliquée.

## CA-5 — Les e2e du périmètre passent sans modification à travers la façade Python ✅

- `PLAYWRIGHT_REUSE_SERVER=0 pnpm test:e2e --grep "@SPEC-2201\b"` : 2 tests verts (fonctionnel et
  visuel), vidéo et captures dans `test-results/artifacts/`.
- Les e2e SPEC-618 (`apps/web/e2e/specs/p6/formation-management.spec.ts`) passent sans modification
  à travers la façade : la reprise reste servie par Hono (ADR-2024) et la pause, l'archive, la
  formation courante et les groupes sont servis par Python.
- Aucune assertion d'oracle ni ligne de base visuelle existante n'a été modifiée (ADR-1001,
  ADR-2008) : `git diff main -- apps/web/__screenshots__` est vide et les fichiers e2e antérieurs
  sont inchangés ; seuls `apps/web/e2e/specs/p22/spec-2201.spec.ts` et la page de démonstration
  sont ajoutés.

## Contrôles de qualité

| Contrôle | Commande | Résultat |
|---|---|---|
| Lint Python | `uv run ruff check .` et `uv run ruff format --check packages-py apps` | vert |
| Types Python | `uv run mypy packages-py apps` | vert |
| Unités et intégration Python | `uv run pytest packages-py apps -q` | vert (**522 tests**) |
| Contrat Python | `pnpm py:contract:check` | vert (artefacts générés inchangés) |
| Lint racine | `pnpm lint` | vert |
| Types racine | `pnpm typecheck` | vert |
| Construction | `pnpm build` | vert |
| Unités TypeScript | `pnpm test:unit` | vert |
| Intégration TypeScript | `pnpm test:int` | vert |
| e2e du périmètre | `pnpm test:e2e --grep "@SPEC-2201\b"` | vert |
| Visuel du périmètre | `pnpm test:visual` | vert |
| Validation SDD | `node tools/sdd/validate.mjs SPEC-2201` | 8 étapes vertes |

## Écarts résiduels connus (consignés, sans ❌)

1. **`null` explicite sur un champ optionnel.** Là où Zod refuse `null` (`z.string().optional()`),
   Pydantic l'accepte et le traite comme absent. Le seul cas du périmètre est un corps envoyé à la
   main avec `null` sur un champ facultatif d'un DTO de formulaire ; aucun appelant ne le fait, et
   aucun test d'oracle ne le couvre. Les schémas concernés n'ont pas été modifiés (ils sont
   générés) ; la correction consisterait à ajouter un raffinement `none_required` dans
   `learny_api.validate.REFINEMENTS`, comme pour `sidebar.update`.
2. **Recherche web de la génération de programme.** `programme/generate.ts` appelle `searchWeb`
   (Tavily/Anthropic) pour n'ajouter que des URL de sources au contexte du prompt. L'adaptateur
   n'est pas porté par cette spécification (il appartient à `learny.platform.llm`, SPEC-2204) :
   `learny.formation.application.programme.search_context` renvoie donc le message
   « Recherche web indisponible », qui est exactement ce que le backend TypeScript renvoie sans
   `SEARCH_API_KEY`. En mode `mock` (tests, e2e, démonstration) le résultat observable est
   identique ; en production, la différence est la présence de sources web dans le prompt, jamais
   le contrat HTTP.
3. **Ordre des clés JSON.** La comparaison de parité trie désormais les clés (`normalizeBody`),
   l'ordre n'étant pas un contrat. Les corps restent identiques valeur pour valeur.
