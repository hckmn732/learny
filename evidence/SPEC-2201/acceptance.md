# Critères d'acceptation — SPEC-2201

État au dernier commit de la branche `spec/SPEC-2201-domaines-identite-formation`. Le pipeline de
contrat et `learny.platform.llm` sont livrés ; le contexte `identity` est porté et basculé à
**13 opérations sur 19**. Le contexte `formation` n'est pas commencé : la spécification reste
partielle et `validate.mjs` / `complete.mjs` n'ont pas été lancés.

| CA | Exigence | État | Preuve |
|---|---|---|---|
| CA-1 | 45 opérations à `py`, cas d'usage des jobs portés, matrice `parity.md` complète | ⚠️ partiel | `api/ownership.yaml` : 13 identités à `py`, 6 à `ts` (ADR-2022, ADR-2023) ; formation 0 / 26. Matrice opération → cas d'usage → tables → tests dans `parity.md` pour identity. |
| CA-2 | Parité contractuelle zéro divergence inexpliquée | ⚠️ partiel | `pnpm parity:check` n'existe pas dans `package.json` et aucun groupe `identity` n'est enregistré : la parité n'est pas mesurée par le harnais. Conformité mesurée par les modèles générés (sorties validées dans les tests), les raffinements Zod réappliqués et les textes `locale_fr` recopiés. Écarts résiduels dans `parity.md`. |
| CA-3 | Chaque test TypeScript du périmètre a un équivalent pytest | ⚠️ partiel | Identity : 42 tests d'intégration + 7 unitaires + 11 de validation (60 cas ajoutés). `auth.*` et `home.get` non portés (restent `ts`). Formation : non porté. `test-port-map.md`. |
| CA-4 | Contrats import-linter verts, aucun adaptateur avec de la règle métier | ✅ | `uv run lint-imports` vert ; les handlers ne font que déléguer ; aucune règle métier dans `pipeline.py` ni dans `views/`. |
| CA-5 | e2e du périmètre verts à travers la façade | ❌ | non exécuté : la pile e2e n'est pas démarrée dans ce worktree et aucun groupe de captures n'existe. Les 13 routes basculées sont couvertes par leurs tests d'intégration sur base locale. |

## Ce qui est prouvé et rejouable

| Commande | Résultat |
|---|---|
| `flock /tmp/learny-sdd-db.lock uv run pytest packages-py apps -q` | ✅ 474 tests (60 ajoutés par la bascule identity) |
| `uv run pytest packages-py/learny/tests/integration/identity -q` | ✅ 42 cas, base locale, transactions annulées |
| `uv run ruff check .` / `uv run ruff format --check packages-py apps` | ✅ |
| `uv run mypy packages-py apps` | ✅ |
| `node tools/contract/generate-py-contract.mjs --check` | ✅ artefacts à jour, `generated/` jamais édité |
| `corepack pnpm exec tsx tools/migration/inventory.mjs` | ✅ inventaire inchangé (217 opérations) |
| contrôle de couverture des handlers | ✅ `HANDLERS` = exactement les 13 entrées `py`, aucune entrée `ts` |

## Reprise — ordre exact

1. **formation** (26 opérations) : `learny/formation/{domain,infrastructure/queries,application}` ;
   cadrage et programme par `learny.platform.llm` (mode mock), groupes (`LRN-XXXX`, 10 membres),
   `notion-graph` (erreur du trigger `validate_notion_link`), `search` via `search_user_content` ;
   handlers `apps/api-py/src/learny_api/handlers/formation.py` ; tests listés dans
   `test-port-map.md` ; bascule par lots dans `api/ownership.yaml`.
2. **home.get** : à porter avec le moteur d'apprentissage de SPEC-2202 (ADR-2023), puis basculer.
3. **auth.\*** : enregistrer d'abord des captures de parité auth (magic link, inscription, connexion,
   déconnexion, renvoi) avec les `Set-Cookie` bruts, puis porter les cookies `@supabase/ssr` et
   comparer octet pour octet (ADR-2022). Ne basculer qu'après égalité prouvée.
4. Rejouer les e2e identity + formation à travers la façade (`PLAYWRIGHT_REUSE_SERVER=0`, verrou
   `/tmp/learny-sdd-db.lock`), puis `node tools/sdd/validate.mjs SPEC-2201` et
   `node tools/sdd/complete.mjs SPEC-2201 --no-merge --no-push`.

## Anomalies connues

1. `datamodel-codegen` perd les `.refine(...)`, `.trim()` et le contrôle IANA : réappliqués par
   `apps/api-py/src/learny_api/validate.py` (11 tests).
2. Le générateur rend `.optional()` par `T | None = None` : un `null` explicite sur un nom de profil
   est accepté alors que Zod répondrait 400 (écart résiduel documenté, non atteint par le client).
3. `starts_with` n'est pas généré (codes d'invitation, contexte formation) : à traiter avant de
   basculer les opérations concernées.
4. `pnpm parity:check` n'existe pas dans `package.json` alors que les plans P20/P22 y renvoient :
   le harnais `tools/parity/run.ts` doit être exposé en script racine avant la parité de SPEC-2202.
