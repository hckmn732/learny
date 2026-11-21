# Critères d'acceptation — SPEC-2201

État honnête au dernier commit de la branche `spec/SPEC-2201-domaines-identite-formation` : les deux
premiers étages du plan (pipeline de contrat, `learny.platform.llm`) sont livrés et prouvés ; les
contextes `identity` et `formation` ne sont **pas** portés, donc aucune opération n'est basculée.

| CA | Exigence | État | Preuve |
|---|---|---|---|
| CA-1 | 45 opérations à `py`, cas d'usage des jobs portés, matrice `parity.md` complète | ❌ | `evidence/SPEC-2201/parity.md` : 0 / 45 à `py` ; `api/ownership.yaml` inchangé pour ces entrées |
| CA-2 | Parité contractuelle zéro divergence inexpliquée | ❌ | non mesurée : les entrées sont encore `ts`, aucun run `parity:check --group identity/formation` possible |
| CA-3 | Chaque test TypeScript du périmètre a un équivalent pytest | ❌ | `test-port-map.md` : seuls les tests d'infrastructure (pipeline, validate, llm) sont portés |
| CA-4 | Contrats import-linter du périmètre verts, aucun adaptateur avec de la règle métier | ⚠️ partiel | `uv run lint-imports` passe sur l'arbre courant ; `learny/platform/llm` n'a aucune dépendance framework et `learny_api/pipeline.py` ne contient aucune règle métier (seulement l'ordre des étapes) |
| CA-5 | e2e du périmètre verts à travers la façade | ❌ | non exécuté : aucune route du périmètre n'est servie par Python, les e2e existants passent donc par le relais comme avant (aucune régression introduite, mais rien à prouver côté bascule) |

## Ce qui est prouvé et rejouable

| Commande | Résultat |
|---|---|
| `uv run pytest packages-py apps -q` | ✅ 414 tests unitaires (dont 64 nouveaux `[SPEC-2201]`) ; intégration avec base locale au dernier run complet |
| `uv run ruff check .` / `uv run ruff format --check packages-py apps` | ✅ |
| `uv run mypy packages-py apps` | ✅ 98 fichiers |
| `node tools/contract/generate-py-contract.mjs --check` | ✅ artefacts à jour, génération déterministe |
| `node tools/sdd/validate.mjs SPEC-2201` | ❌ non lancé : les CA-1/CA-2/CA-3/CA-5 échouent par construction (périmètre non porté) |

## Reprise — ordre exact

1. **identity** : `learny/identity/domain` (aucune logique pure au-delà de l'acteur déjà porté),
   `infrastructure/queries.py` (profils, préférences, `legal_acceptances` en insertion seule,
   `ai_task_models` ⨝ `ai_credentials`), `application/` (`me`, `security`, `legal`, préférences,
   profil), `views/{header,sidebar,home}.py` en SQL lecture seule, puis
   `apps/api-py/src/learny_api/handlers/identity.py`.
2. **formation** : `application/{cadrage,programme,groups,notion_graph,search}.py` ; cadrage et
   programme passent par `learny.platform.llm` (mode mock identique) ; `search` appelle
   `search_user_content` ; `programme.validate` émet `formation/programme-validated` via
   `tx.emit` ; groupes : code `LRN-XXXX`, 10 membres, règles du propriétaire.
3. Porter les tests listés dans `test-port-map.md` (mêmes cas, `[SPEC-2201]`), puis basculer
   `api/ownership.yaml` par lots (`identity` d'abord, `formation` ensuite) et rejouer les e2e
   concernés (`PLAYWRIGHT_REUSE_SERVER=0`, verrou de base `flock /tmp/learny-sdd-db.lock`).
4. Compléter `parity.md` (entrée → cas d'usage → règles BR → tables → tests → résultat) et
   `acceptance.md`, puis `node tools/sdd/validate.mjs SPEC-2201` (8 étapes) et
   `node tools/sdd/complete.mjs SPEC-2201 --no-merge --no-push`.

Commandes de reprise :

```bash
cd /home/ubuntu/projects/learny-wt-SPEC-2201
export PATH="$HOME/.local/bin:$PATH"
git log --oneline -3           # dernier commit de la branche
uv sync --frozen               # .venv déjà présent
uv run pytest packages-py apps -q
```