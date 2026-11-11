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

## 3. Commits

Conventional Commits, portée obligatoire (`SPEC-xxx`, `CP-n` ou `sdd`), description en français à l'impératif, ≤ 72 caractères :

```
feat(SPEC-402): calcule l'échéance FSRS d'une notion
test(SPEC-402): couvre les cas de référence de l'échéancier
evidence(SPEC-402): preuves de validation
```

Types : `feat`, `fix`, `test`, `docs`, `refactor`, `perf`, `build`, `ci`, `chore`, `style`, `revert`, `evidence`. Détails : [`docs/engineering/git.md`](docs/engineering/git.md).

## 4. Décisions

Toute ambiguïté est tranchée sans attendre de validation, selon l'ordre ADR → règles métier → spécification → maquette → documents → standards, puis consignée :

```bash
node tools/sdd/adr.mjs new "Titre" --context "…" --decision "…" --links "SPEC-xxx"
```

## 5. Interdits

Modifier `design/maquettes/` ou `docs/legacy/` ; inventer une preuve ou un résultat ; affaiblir un test pour le faire passer ; créer un dépôt distant, modifier les remotes, pousser en force, réécrire l'historique de `main` ; committer un secret ; implémenter hors périmètre (ADR-0005).

## 6. Pour le porteur du projet : configuration du dépôt GitHub

Le dépôt `https://github.com/hckmn732/learny.git` est créé et administré par le porteur du projet. Réglages recommandés (Settings) :

1. **Branches → Branch protection rule** sur `main` : exiger la réussite des checks `Audit du référentiel`, `Recherche de secrets`, `Lint, types, build, unitaires`, `Intégration (Supabase local)`, `E2E et conformité visuelle (Chromium)` ; interdire les push forcés et la suppression.
2. **Secrets and variables → Actions** : ajouter les secrets des services gérés lorsque SPEC-013 les demande (Supabase, Vercel, Anthropic, Voyage, Resend, Stripe, Sentry, Inngest). Leur absence est consignée comme blocage externe dans `progress/blockers.md`, jamais contournée.
3. **Git LFS** : activé par défaut sur GitHub ; surveiller le quota de stockage des vidéos de preuves.
