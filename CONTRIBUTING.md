# Contribuer à Learny

Learny est livré par des agents IA qui suivent le processus Spec-Driven Development du dépôt. Toute contribution, humaine ou automatique, respecte les mêmes règles.

## 1. Avant de commencer

1. Lire [`AGENTS.md`](AGENTS.md) puis [`docs/engineering/sdd-process.md`](docs/engineering/sdd-process.md).
2. Prérequis : Node 24 (`.nvmrc`), pnpm 10 (`corepack enable`), Docker (Supabase local, Mailpit, Inngest Dev Server), Git LFS recommandé (vidéos de preuves, ADR-0050).
3. Copier `.env.example` en `.env.local` ; aucun secret n'est jamais commité.

## 2. Travailler sur une spécification

```bash
node tools/sdd/next.mjs                 # quelle spécification ?
node tools/sdd/start.mjs SPEC-xxx       # branche spec/SPEC-xxx-slug + verrou
# implémenter (section 8), écrire les tests (section 12), commits atomiques
node tools/sdd/validate.mjs SPEC-xxx    # toutes les validations + preuves
# compléter evidence/SPEC-xxx/acceptance.md (✅ + preuve par critère), relancer validate
node tools/sdd/complete.mjs SPEC-xxx    # preuves commitées, statut done, fusion --no-ff, push
```

Une spécification n'est terminée que si lint, typecheck, build, tests unitaires `[SPEC-xxx]`, intégration `[SPEC-xxx]`, e2e `@SPEC-xxx` avec vidéo, au moins un test `@visual` et tous les critères d'acceptation sont verts, sans régression.

## 3. Installation

```bash
corepack enable
pnpm install          # installe le monorepo et active les hooks Git (script prepare → husky)
git config core.hooksPath   # doit afficher .husky/_
```

En CI (`CI=true`) ou hors dépôt Git, `husky` n'installe rien et ne fait pas échouer l'installation.

## 4. Branches et commits

Branches : `main` (fusions `--no-ff` uniquement), `spec/SPEC-xxx-slug`, `fix/SPEC-xxx-slug`, `release/vX.Y.Z` ([`docs/engineering/git.md`](docs/engineering/git.md)).

Format imposé par commitlint (`commitlint.config.ts`, règles dans `packages/config/src/commit-rules.ts`, ADR-0103) :

```
<type>(<portée>): <description>
```

| Élément | Règle |
|---|---|
| Type | `feat`, `fix`, `test`, `docs`, `refactor`, `perf`, `build`, `ci`, `chore`, `style`, `revert`, `evidence`, `merge` |
| Portée | obligatoire : `SPEC-xxx` (3 chiffres), `CP-n` ou `sdd` |
| Description | non vide, sans point final, ≤ 72 caractères (≤ 100 pour `merge`), casse libre |
| En-tête | ≤ 100 caractères |
| Corps et pied | séparés de l'en-tête par une ligne vide, lignes ≤ 100 caractères ; pieds `Refs: SPEC-xxx`, `ADR: ADR-xxxx` |

Acceptés :

```
feat(SPEC-402): calcule la prochaine révision FSRS
evidence(SPEC-001): preuves de validation
chore(SPEC-001): marque la spécification terminée
merge(SPEC-006): Application web : configuration de base, santé et pages de démonstration
chore(CP-0): checkpoint CP-0 réussi
chore(sdd): initialise le référentiel
docs(SPEC-002): complète CONTRIBUTING
```

Refusés : `feat: ajoute X` (portée vide), `feat(web): ajoute X` (portée hors motif), `feature(SPEC-001): ajoute X` (type inconnu), `feat(SPEC-1): ajoute X` (portée mal formée), `feat(SPEC-001):` (description vide), `feat(SPEC-001): ajoute X.` (point final), une description de plus de 72 caractères, `ajoute X` (pas d'en-tête conventionnel). Les messages `Merge …` et `Revert "…"` générés par Git sont ignorés.

## 5. Hooks Git

| Hook | Commande |
|---|---|
| `pre-commit` | `pnpm exec lint-staged` (ESLint `--fix` et Prettier sur les fichiers indexés), puis `pnpm exec tsx tools/security/check-secrets.ts --staged` |
| `commit-msg` | `pnpm exec commitlint --edit "$1"` |
| `pre-push` | `pnpm -s typecheck && pnpm -s test:unit` |

**Contournement interdit** : `git commit --no-verify`, `git push --no-verify`, `HUSKY=0` ou la modification de `core.hooksPath` ne sont jamais utilisés ([`docs/engineering/git.md`](docs/engineering/git.md) §5). Un hook en échec se corrige, il ne se contourne pas.

## 6. Protection des secrets

- Aucun secret n'est versionné : les valeurs vont dans `.env.local` (ignoré), seul `.env.example` est commité.
- `tools/security/check-secrets.ts` refuse tout fichier `.env*` (sauf `.env.example`), `*.pem`, `*.p12`, `*.key`, et toute ligne ajoutée qui ressemble à une clé (Anthropic, OpenAI, Stripe, AWS, JWT, clé privée…). La sortie masque la valeur (4 premiers caractères puis `…`).
- [gitleaks](https://github.com/gitleaks/gitleaks) ≥ 8.18 est **recommandé** en local (obligatoire en CI) : s'il est sur le `PATH`, il s'exécute en plus de l'analyseur intégré (`.gitleaks.toml`). Absent, l'analyse intégrée suffit.
- Toute fausse clé de test doit contenir le mot témoin `learny-test-only` (ex. `sk-ant-learny-test-only-0000000000000000`) : la ligne est ignorée par les deux analyseurs.
- Contrôle du dépôt entier : `pnpm exec tsx tools/security/check-secrets.ts --all`.

## 7. Décisions

Toute ambiguïté est tranchée sans attendre de validation, selon l'ordre ADR → règles métier → spécification → maquette → documents → standards, puis consignée :

```bash
node tools/sdd/adr.mjs new "Titre" --context "…" --decision "…" --links "SPEC-xxx"
```

## 8. Interdits

Modifier `design/maquettes/` ou `docs/legacy/` ; inventer une preuve ou un résultat ; affaiblir un test pour le faire passer ; créer un dépôt distant, modifier les remotes, pousser en force, réécrire l'historique de `main` ; committer un secret ; implémenter hors périmètre (ADR-0005).

## 9. Pour le porteur du projet : configuration du dépôt GitHub

Le dépôt `https://github.com/hckmn732/learny.git` est créé et administré par le porteur du projet. Réglages recommandés (Settings) :

1. **Branches → Branch protection rule** sur `main` : exiger la réussite des checks `Audit du référentiel`, `Recherche de secrets`, `Lint, types, build, unitaires`, `Intégration (Supabase local)`, `E2E et conformité visuelle (Chromium)` ; interdire les push forcés et la suppression ; conserver l'historique des fusions `--no-ff` (pas de squash ni de rebase à la fusion).
2. **Secrets and variables → Actions** : ajouter les secrets des services gérés lorsque SPEC-013 les demande (Supabase, Vercel, Anthropic, Voyage, Resend, Stripe, Sentry, Inngest). Leur absence est consignée comme blocage externe dans `progress/blockers.md`, jamais contournée.
3. **Git LFS** : activé par défaut sur GitHub ; surveiller le quota de stockage des vidéos de preuves.
