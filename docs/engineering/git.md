# Versionnement Git

Le dépôt est initialisé localement (branche `main`). Le dépôt distant sera créé et connecté par le porteur du projet (`git remote add origin …`) : **aucun agent ne crée de dépôt distant, ne pousse vers un remote inexistant ni ne modifie la configuration des remotes**. Si `origin` existe, la boucle pousse après chaque fusion ; sinon elle continue en local (ADR-0051).

## 1. Branches

| Branche | Rôle |
|---|---|
| `main` | état livrable ; ne reçoit que des fusions de branches de spécification validées et les commits d'outillage du référentiel |
| `spec/<SPEC-ID>-<slug>` | une branche par spécification, créée depuis `main` au démarrage (`spec/SPEC-402-fsrs`) |
| `fix/<SPEC-ID>-<slug>` | correction d'une anomalie détectée après fusion, rattachée à la spécification d'origine |
| `release/vX.Y.Z` | préparation d'une version (CP-8 → `v1.0.0`, CP-9 → `v2.0.0`) |

Fusion : `git merge --no-ff spec/<…>` dans `main`, message `merge(SPEC-xxx): <titre>` ; la branche est ensuite supprimée localement.

### 1.1 Worktrees et travail parallèle

Le parallélisme passe par des worktrees, jamais par des branches partagées ou des commits simultanés sur le même répertoire.

```bash
git worktree add ../learny-wt-<id> spec/SPEC-xxx-<slug>
cd ../learny-wt-<id>
node tools/sdd/start.mjs SPEC-xxx     # verrou SDD propre au worktree
# … implémentation, commits atomiques, validate.mjs, complete.mjs --no-merge --no-push
```

- Un worktree par spécification en cours ; le worktree principal reste sur `main` et sert aux fusions, à la CI, aux checkpoints et à l'app QA.
- Un agent de spec ne fusionne ni ne pousse : `complete.mjs --no-merge --no-push`. Seul l'agent principal fusionne `--no-ff`, pousse et tague.
- Avant de fusionner : `git status` propre dans le worktree, preuves commitées, branche à jour de `main` si la spec a été longue.
- Après fusion : `git worktree remove ../learny-wt-<id>` (ajouter `--force` uniquement pour des fichiers non suivis générés et après vérification) puis supprimer la branche locale.
- Les commandes qui touchent la base partagée restent sérialisées (`flock /tmp/learny-sdd-db.lock`) et les campagnes E2E ne se chevauchent pas (port et serveur isolés). Détail : `docs/engineering/sdd-process.md` §2 bis.

## 2. Commits (Conventional Commits, imposés par commitlint — SPEC-002)

Format : `<type>(<SPEC-ID>): <description à l'impératif, en français, ≤ 72 caractères>`

- Types : `feat`, `fix`, `test`, `docs`, `refactor`, `perf`, `build`, `ci`, `chore`, `style`, `revert`, `evidence`.
- La portée est **obligatoirement** l'identifiant de la spécification (`SPEC-402`), `CP-n` pour un checkpoint, ou `sdd` pour l'outillage du référentiel.
- Corps facultatif : pourquoi, décisions (référence ADR). Pied : `Refs: SPEC-402`, `ADR: ADR-0025` le cas échéant.
- Atomicité : un commit = un changement cohérent qui compile et passe les tests. Une spécification produit typiquement 2 à 6 commits : implémentation, tests, preuves (`evidence(SPEC-402): preuves de validation`), suivi (`chore(SPEC-402): marque la spécification terminée`).
- Aucun commit sur `main` d'un état qui ne passe pas `pnpm lint && pnpm typecheck && pnpm test:unit`.

## 3. Tags et versions

- Checkpoints : tag annoté `cp-<n>` sur `main` après réussite du checkpoint (`cp-0` … `cp-9`).
- Versions SemVer : `v0.<phase>.0` à chaque checkpoint de phase (ex. `v0.4.0` après CP-4) ; `v1.0.0` à CP-8 ; `v2.0.0` à CP-9. `CHANGELOG.md` est mis à jour à chaque tag (format Keep a Changelog, généré depuis les commits par `tools/sdd/changelog.mjs`).

## 4. Fichiers protégés et secrets

- `.gitignore` exclut `.env*` (sauf `.env.example`), `node_modules`, sorties de build, `test-results/`, `playwright-report/`, `coverage/`, `.turbo/`, `.next/`, `supabase/.temp`, `.sdd/lock`.
- Les secrets ne sont jamais commités : `gitleaks` en pre-commit (si installé) et en CI ; `packages/config` refuse de démarrer en production si une variable obligatoire manque.
- Les vidéos de preuves passent par Git LFS (`.gitattributes`).

## 5. Workflow de validation

1. Hooks locaux (SPEC-002) : `pre-commit` → lint-staged (Prettier, ESLint sur les fichiers modifiés), gitleaks ; `commit-msg` → commitlint ; `pre-push` → `pnpm typecheck && pnpm test:unit`.
2. CI GitHub Actions (`.github/workflows/ci.yml`, SPEC-011) sur chaque push et pull request : audit du référentiel, lint, typecheck, build, tests unitaires, intégration (Supabase local), e2e (Chromium), conformité visuelle, upload des rapports et preuves en artefacts.
3. Protection de `main` (à activer par le porteur du projet sur le dépôt distant, documenté dans `CONTRIBUTING.md`) : CI verte obligatoire, historique linéaire des fusions `--no-ff`, pas de push forcé.
