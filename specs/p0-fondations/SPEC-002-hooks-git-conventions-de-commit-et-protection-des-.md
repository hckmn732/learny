---
id: SPEC-002
title: Hooks Git, conventions de commit et protection des secrets
phase: P0
priority: V1
depends_on: [SPEC-001]
business_rules: []
screens: []
adrs: [ADR-0051, ADR-0100, ADR-0103]
visual: demo
---

# SPEC-002 — Hooks Git, conventions de commit et protection des secrets

## 1. Objectif

Imposer localement les conventions de `docs/engineering/git.md` : hooks Husky (`pre-commit`, `commit-msg`, `pre-push`), commitlint avec portée obligatoire (`SPEC-xxx`, `CP-n`, `sdd`), lint-staged, détection des secrets avant commit (gitleaks s'il est installé, sinon un analyseur intégré), et documenter le tout dans `CONTRIBUTING.md`. Un commit mal formé ou contenant un secret doit être refusé (critère CP-0).

## 2. Contexte

S'appuie sur le monorepo de SPEC-001. Les commits produits par l'outillage existant doivent rester acceptés : `evidence(SPEC-xxx): preuves de validation`, `chore(SPEC-xxx): marque la spécification terminée` (`tools/sdd/complete.mjs`), `merge(SPEC-xxx): <titre de la spécification>` (fusion `--no-ff`, le hook `commit-msg` s'exécute aussi pour `git merge`), `chore(CP-n): checkpoint CP-n réussi` (`tools/sdd/checkpoint.mjs`), `chore(sdd): …`. Les titres de spécifications commencent par une majuscule et dépassent parfois 72 caractères (en-tête de fusion le plus long : 89 caractères), d'où les règles de ADR-0103.

À lire : `docs/engineering/git.md`, ADR-0051, ADR-0100, ADR-0103, `tools/sdd/complete.mjs`, `tools/sdd/checkpoint.mjs`.

## 3. Dépendances

- **SPEC-001** : monorepo, `@learny/config`, ESLint/Prettier, Vitest, Playwright, page de démonstration et coquille `DemoShell`.
- Bibliothèques (dernière version stable) : `husky` ≥ 9, `lint-staged` ≥ 15, `@commitlint/cli`, `@commitlint/config-conventional`, `@commitlint/lint`, `@commitlint/load` ≥ 19, `tsx` ≥ 4.
- Outil facultatif : `gitleaks` ≥ 8.18 sur le `PATH`. Absent → analyseur intégré (pas un blocage). Présent en CI (SPEC-011).
- Git doit exister (ADR-0100).

## 4. Règles métier couvertes

Aucune règle `BR-*` : spécification d'outillage. Elle sert indirectement BR-PLA-08 (« secrets uniquement côté serveur ») en empêchant qu'un secret soit versionné ; la conformité complète de BR-PLA-08 est portée par SPEC-009 et les spécifications de sécurité ultérieures.

## 5. Exigences fonctionnelles

- **EF-1** — `pnpm install` active les hooks (`"prepare": "husky"` dans le `package.json` racine ; `git config core.hooksPath` vaut `.husky/_`). En CI (`CI=true`) ou hors dépôt Git, `husky` ne fait rien et ne fait pas échouer l'installation.
- **EF-2** — `pre-commit` exécute dans l'ordre : `pnpm exec lint-staged`, puis `pnpm exec tsx tools/security/check-secrets.ts --staged`. Échec de l'un → commit refusé.
- **EF-3** — `commit-msg` exécute `pnpm exec commitlint --edit "$1"`. Un message non conforme est refusé avec la liste des règles violées.
- **EF-4** — `pre-push` exécute `pnpm -s typecheck && pnpm -s test:unit`.
- **EF-5** — Format accepté : `<type>(<portée>): <description>` avec :
  - types : `feat`, `fix`, `test`, `docs`, `refactor`, `perf`, `build`, `ci`, `chore`, `style`, `revert`, `evidence`, `merge` ;
  - portée obligatoire, correspondant exactement à `^(SPEC-\d{3}|CP-\d|sdd)$` ;
  - description non vide, sans point final, de 72 caractères au plus (100 pour le type `merge`) ; casse libre (français, noms propres) ;
  - en-tête de 100 caractères au plus ; corps et pied séparés par une ligne vide ; lignes de corps de 100 caractères au plus ; pieds `Refs: SPEC-xxx` et `ADR: ADR-xxxx` autorisés.
  - Messages ignorés (comportement par défaut de commitlint) : `Merge …` et `Revert "…"` générés par Git.
- **EF-6** — Exemples normatifs (repris par les tests) :
  - acceptés : `feat(SPEC-402): calcule la prochaine révision FSRS`, `evidence(SPEC-001): preuves de validation`, `chore(SPEC-001): marque la spécification terminée`, `merge(SPEC-006): Application web : configuration de base, santé et pages de démonstration`, `chore(CP-0): checkpoint CP-0 réussi`, `chore(sdd): initialise le référentiel`, `docs(SPEC-002): complète CONTRIBUTING`.
  - refusés : `feat: ajoute X` (portée vide), `feat(web): ajoute X` (portée hors motif), `feature(SPEC-001): ajoute X` (type inconnu), `feat(SPEC-1): ajoute X` (portée mal formée), `feat(SPEC-001):` (description vide), `feat(SPEC-001): ajoute X.` (point final), `feat(SPEC-001): ` + 73 caractères (description trop longue), `ajoute X` (pas d'en-tête conventionnel).
- **EF-7** — `lint-staged` (`lint-staged.config.mjs`) : `*.{ts,tsx,mjs,js}` → `eslint --max-warnings=0 --fix` puis `prettier --write` ; `*.{json,md,yml,yaml,css}` → `prettier --write`. Les fichiers listés dans `.prettierignore` (dont `evidence/`, `progress/`, `specs/`, `docs/adr/`, `tools/sdd/`) ne sont pas modifiés (`prettier --write --ignore-unknown`). ESLint n'est jamais lancé sur `tools/sdd/**` par lint-staged (motif négatif `!tools/sdd/**`).
- **EF-8** — `tools/security/check-secrets.ts` :
  - modes : `--staged` (contenu indexé : `git diff --cached --no-color -U0 --diff-filter=ACMR`), `--all` (fichiers suivis : `git ls-files`), `--path <fichier>` (un fichier) ;
  - si `gitleaks version` réussit : `gitleaks git --staged --redact --no-banner --config .gitleaks.toml` (version ≥ 8.19) ou `gitleaks protect --staged --redact --no-banner --config .gitleaks.toml` (version < 8.19) en mode `--staged`, `gitleaks dir . --redact --config .gitleaks.toml` en mode `--all` ; l'analyseur intégré s'exécute **aussi** (double contrôle) ;
  - refuse tout fichier indexé dont le chemin correspond à `(^|/)\.env($|\.)` sauf `.env.example`, et tout fichier `*.pem`, `*.p12`, `*.key` ;
  - sortie en échec : une ligne par trouvaille `<fichier>:<ligne> <règle> <aperçu masqué>` (4 premiers caractères puis `…`), puis « Commit refusé : secret détecté. Retirez-le, utilisez une variable d'environnement (voir .env.example). » ; code de sortie 1. Sans trouvaille : « Aucun secret détecté. », code 0.
- **EF-9** — Une ligne contenant le mot témoin `learny-test-only` est ignorée par l'analyseur intégré et par gitleaks (`stopwords`) : toute fausse clé de test du dépôt doit le contenir (ex. `sk-ant-learny-test-only-0000000000000000`).
- **EF-10** — `CONTRIBUTING.md` (créé s'il n'existe pas) décrit : prérequis (Node 24, pnpm 10, Docker), installation, branches et format des commits (tableau des types, exemples EF-6), hooks et commandes de contournement interdites (`--no-verify` interdit, git.md §5), protection des secrets (gitleaks recommandé, mot témoin), protection de `main` à activer par le porteur sur GitHub (CI verte obligatoire, pas de push forcé, historique de fusions `--no-ff`).

## 6. Exigences techniques

- **ET-1** — `packages/config/src/commit-rules.ts` exporte :
  - `COMMIT_TYPES` (tableau `as const` des 13 types), `COMMIT_SCOPE_PATTERN = /^(SPEC-\d{3}|CP-\d|sdd)$/`, `SUBJECT_MAX = 72`, `MERGE_SUBJECT_MAX = 100`, `HEADER_MAX = 100` ;
  - `commitlintRules` : `{ 'type-enum': [2, 'always', COMMIT_TYPES], 'scope-empty': [2, 'never'], 'learny/scope-pattern': [2, 'always'], 'learny/subject-max-length': [2, 'always'], 'subject-empty': [2, 'never'], 'subject-full-stop': [2, 'never', '.'], 'subject-case': [0], 'header-max-length': [2, 'always', HEADER_MAX], 'body-leading-blank': [2, 'always'], 'footer-leading-blank': [2, 'always'], 'body-max-line-length': [2, 'always', 100] }` ;
  - `commitlintPlugin` : `{ rules: { 'learny/scope-pattern': (parsed) => [ok, message], 'learny/subject-max-length': (parsed) => [ok, message] } }` avec les messages « la portée doit être SPEC-xxx, CP-n ou sdd » et « la description dépasse 72 caractères (100 pour merge) ».
- **ET-2** — `commitlint.config.ts` (racine) : `extends: ['@commitlint/config-conventional']`, `plugins: [commitlintPlugin]`, `rules: commitlintRules`, `defaultIgnores: true`.
- **ET-3** — `packages/config/src/secret-patterns.ts` exporte `SECRET_ALLOW_MARKER = 'learny-test-only'`, `SECRET_PATTERNS: ReadonlyArray<{ id: string; regex: RegExp }>` :
  - `anthropic-key` `/sk-ant-[A-Za-z0-9_-]{20,}/` ; `openai-key` `/sk-(?:proj-)?[A-Za-z0-9_-]{32,}/` ; `stripe-key` `/(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}/` ; `stripe-webhook` `/whsec_[0-9A-Za-z]{20,}/` ; `aws-access-key` `/AKIA[0-9A-Z]{16}/` ; `private-key` `/-----BEGIN [A-Z ]*PRIVATE KEY-----/` ; `jwt` `/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/` ; `resend-key` `/re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/` ; `voyage-key` `/pa-[A-Za-z0-9_-]{30,}/` ; `tavily-key` `/tvly-[A-Za-z0-9]{20,}/` ; `sentry-token` `/sntry[su]_[A-Za-z0-9+/=_-]{20,}/` ; `vercel-token` `/(?:VERCEL_TOKEN|SUPABASE_ACCESS_TOKEN)\s*[=:]\s*['"]?[A-Za-z0-9_-]{20,}/` ; `generic-assignment` `/(?:api[_-]?key|secret|password|token)\s*[=:]\s*['"][^'"\s]{16,}['"]/i` ;
  - `scanText(text: string, file: string): Finding[]` (`Finding = { file, line, rule, preview }`), qui ignore les lignes contenant `SECRET_ALLOW_MARKER` ;
  - `isForbiddenSecretFile(path: string): boolean` (règle `.env`, `.pem`, `.p12`, `.key` de EF-8).
- **ET-4** — `.gitleaks.toml` : `[extend] useDefault = true` ; `[allowlist] description = "Valeurs de test documentées"`, `paths = ['''pnpm-lock\.yaml''', '''^docs/legacy/''', '''^design/maquettes/''', '''^evidence/.*\.(json|xml)$''']`, `stopwords = ['''learny-test-only''']`.
- **ET-5** — `.husky/pre-commit`, `.husky/commit-msg`, `.husky/pre-push` : scripts POSIX sans shebang ni chargement de `husky.sh` (format Husky 9), contenus exacts de EF-2 à EF-4, fins de ligne LF (assurées par `.gitattributes`).
- **ET-6** — Démonstration : route handlers `apps/web/app/api/v1/%5Fdev/commit-check/route.ts` (POST `{ message: string }` validé par Zod, 1 à 2000 caractères → 200 `{ valid: boolean, errors: { name: string; message: string }[], warnings: … }` calculé par `@commitlint/lint(message, commitlintRules, { plugins: { learny: commitlintPlugin }, defaultIgnores: true })` avec les règles de `config-conventional` fusionnées) et `apps/web/app/api/v1/%5Fdev/secret-scan/route.ts` (POST `{ text: string }` ≤ 20 000 caractères → 200 `{ findings: Finding[] }` via `scanText(text, 'saisie')`). Garde ADR-0102 : 404 si les pages SDD sont désactivées. Entrée invalide → 400 `application/problem+json` `{ type: 'about:blank', title: 'Requête invalide', status: 400, code: 'VALIDATION_FAILED' }`.
- **ET-7** — Aucune donnée saisie n'est journalisée (le texte analysé peut contenir un secret).

## 7. Comportements attendus et cas limites

- **CL-1** — `git merge --no-ff spec/SPEC-006-… -m "merge(SPEC-006): Application web : configuration de base, santé et pages de démonstration"` → accepté (type `merge`, description de 73 caractères ≤ 100, casse libre).
- **CL-2** — Message multi-lignes avec pied `Refs: SPEC-402` → accepté ; corps collé à l'en-tête sans ligne vide → refusé (`body-leading-blank`).
- **CL-3** — `git revert` produit `Revert "feat(SPEC-402): …"` → ignoré par commitlint (accepté).
- **CL-4** — Fichier `.env.local` indexé par erreur → `check-secrets` refuse même s'il est vide.
- **CL-5** — Clé factice `sk-ant-learny-test-only-0000000000000000` dans un test → acceptée ; `sk-ant-api03-AbCdEf…` (≥ 20 caractères) → refusée.
- **CL-6** — gitleaks absent → message « gitleaks introuvable : analyse intégrée uniquement. » sur la sortie d'erreur, puis analyse intégrée ; aucun échec dû à l'absence.
- **CL-7** — Commit d'une suppression seule (`--diff-filter=ACMR` exclut les suppressions) → aucune analyse de contenu, code 0.
- **CL-8** — Installation en CI (`CI=true`) → `husky` n'installe pas les hooks ; aucune erreur.
- **CL-9** — Fichier binaire indexé → ignoré par l'analyseur intégré (détection : présence d'un octet nul dans les 8 000 premiers octets).
- **CL-10** — Message de commit vide → refusé par Git avant commitlint ; message composé uniquement de commentaires → idem.

## 8. Instructions d'implémentation

1. Installer `husky`, `lint-staged`, `@commitlint/cli`, `@commitlint/config-conventional`, `@commitlint/lint`, `@commitlint/load`, `tsx` en dépendances de développement racine ; ajouter `"prepare": "husky"` ; exécuter `pnpm install` pour créer `.husky/_`. Commit `build(SPEC-002): installe Husky, lint-staged et commitlint`.
2. Écrire `packages/config/src/commit-rules.ts` et `commitlint.config.ts`, exporter depuis `packages/config/src/index.ts`. Commit `feat(SPEC-002): définit les règles de commit`.
3. Écrire `.husky/commit-msg`, `.husky/pre-commit`, `.husky/pre-push`, `lint-staged.config.mjs`. Vérifier manuellement : `git commit --allow-empty -m "feat: x"` doit échouer. Commit `build(SPEC-002): ajoute les hooks Git`.
4. Écrire `packages/config/src/secret-patterns.ts`, `tools/security/check-secrets.ts` (logique : lister les fichiers selon le mode, refuser les fichiers interdits, appeler gitleaks si disponible, appliquer `scanText` sur les lignes ajoutées, afficher et sortir) et `.gitleaks.toml`. Commit `feat(SPEC-002): détecte les secrets avant commit`.
5. Écrire les route handlers de démonstration, `apps/web/components/sdd-demos/spec-002.tsx` (composant client) et l'entrée `SPEC-002` du registre. Commit `feat(SPEC-002): ajoute la démonstration des conventions de commit`.
6. Rédiger `CONTRIBUTING.md` (EF-10). Commit `docs(SPEC-002): documente les conventions de contribution`.
7. Écrire les tests (section 12), créer la ligne de base visuelle (`--update-snapshots` filtré sur `@SPEC-002 @visual`). Commit `test(SPEC-002): teste les règles de commit et la détection des secrets`.
8. `node tools/sdd/validate.mjs SPEC-002`, compléter `acceptance.md`, `node tools/sdd/complete.mjs SPEC-002` (les commits de preuves et la fusion passent par les hooks : ils doivent être acceptés, CA-6).

## 9. Fichiers et composants concernés

- **Créés** : `.husky/pre-commit`, `.husky/commit-msg`, `.husky/pre-push`, `commitlint.config.ts`, `lint-staged.config.mjs`, `.gitleaks.toml`, `CONTRIBUTING.md`, `packages/config/src/commit-rules.ts`, `packages/config/src/commit-rules.test.ts`, `packages/config/src/secret-patterns.ts`, `packages/config/src/secret-patterns.test.ts`, `tools/security/check-secrets.ts`, `tools/security/test/integration/hooks.test.ts`, `apps/web/app/api/v1/%5Fdev/commit-check/route.ts`, `apps/web/app/api/v1/%5Fdev/secret-scan/route.ts`, `apps/web/components/sdd-demos/spec-002.tsx`, `apps/web/e2e/specs/p0/spec-002.spec.ts`.
- **Modifiés** : `package.json` (script `prepare`, dépendances), `packages/config/src/index.ts` (exports), `apps/web/app/%5Fdev/sdd/registry.ts` (entrée SPEC-002), `apps/web/messages/fr.ts` (textes de la démonstration), `apps/web/package.json` (`@commitlint/lint`, `@commitlint/config-conventional`).
- **Lus** : `tools/sdd/complete.mjs`, `tools/sdd/checkpoint.mjs`, `docs/engineering/git.md`.

## 10. Interface et conformité visuelle

Mode `demo`. Page `/_dev/sdd/SPEC-002` dans `DemoShell` (titre « Hooks Git, conventions de commit et protection des secrets »), contenu dans l'ordre :

1. Section `data-testid="spec-002-hooks"`, `h2` « Hooks actifs » : tableau (« Hook », « Commande ») avec trois lignes : `pre-commit` → `lint-staged puis check-secrets --staged` ; `commit-msg` → `commitlint --edit` ; `pre-push` → `typecheck puis test:unit`. Ligne d'état `data-testid="spec-002-hooks-path"` : « core.hooksPath = .husky/_ » (lu côté serveur par `git config core.hooksPath` ; si Git indisponible : « core.hooksPath indisponible »).
2. Section `data-testid="spec-002-commit"`, `h2` « Vérifier un message de commit » : `label` « Message de commit » associé à un `textarea` (`data-testid="commit-message"`, 4 lignes), bouton « Vérifier le message » (`data-testid="commit-check"`), zone de résultat `data-testid="commit-result"` avec `aria-live="polite"` : « Message conforme » (texte vert `#1F7A3A`) ou « Message refusé » (rouge `#B42318`) suivi d'une liste `ul` des erreurs `<nom de règle> : <message>`.
3. Section `data-testid="spec-002-secrets"`, `h2` « Détecter un secret » : `label` « Texte à analyser », `textarea` `data-testid="secret-text"`, bouton « Analyser » (`data-testid="secret-scan"`), résultat `data-testid="secret-result"` (`aria-live="polite"`) : « Aucun secret détecté. » ou « n secret(s) détecté(s) » et une ligne par trouvaille `ligne <n> — <règle> — <aperçu masqué>`.
4. Section `data-testid="spec-002-types"`, `h2` « Types autorisés » : liste des 13 types séparés par des virgules et le motif de portée `SPEC-xxx · CP-n · sdd`.

Le bouton est désactivé pendant la requête (pas de double envoi). Contrôles visuels : structure (ordre des 4 sections, libellés exacts) et `toHaveScreenshot('spec-002-demo.png', { fullPage: true, maxDiffPixelRatio: 0.01 })` dans l'état initial (champs vides).

## 11. Critères d'acceptation

- **CA-1** — Les 7 messages acceptés et les 8 messages refusés de EF-6 sont classés correctement par la configuration commitlint chargée depuis `commitlint.config.ts`.
- **CA-2** — Dans un dépôt de test, `git commit -m "feat: ajoute X"` est refusé par le hook `commit-msg` et `git commit -m "feat(SPEC-002): ajoute X"` est accepté.
- **CA-3** — Un fichier indexé contenant `sk-ant-api03-` suivi de 30 caractères, ou un fichier `.env`, fait échouer `check-secrets --staged` (code 1, valeur masquée dans la sortie) ; une valeur contenant `learny-test-only` passe.
- **CA-4** — Après `pnpm install`, `git config core.hooksPath` vaut `.husky/_` et les trois hooks existent et contiennent les commandes de EF-2 à EF-4.
- **CA-5** — La page `/_dev/sdd/SPEC-002` vérifie un message et analyse un texte avec les résultats exacts de la section 10.
- **CA-6** — Les messages produits par `tools/sdd/complete.mjs` et `tools/sdd/checkpoint.mjs` (`evidence(...)`, `chore(...)`, `merge(SPEC-xxx): <titre>` pour les 13 titres P0 et le plus long titre du catalogue) sont acceptés.

## 12. Plan de tests

- **Unitaires** :
  - `packages/config/src/commit-rules.test.ts` — `describe('[SPEC-002] commit rules')` : charge les règles avec `@commitlint/lint` + `config-conventional` ; `it.each` sur les 7 acceptés et 8 refusés de EF-6 ; CL-1, CL-2, CL-3 ; génère `merge(<id>): <title>` pour **chaque** entrée de `specs/catalog.json` et vérifie l'acceptation (CA-6).
  - `packages/config/src/secret-patterns.test.ts` — `describe('[SPEC-002] secret patterns')` : une valeur positive et une négative par motif ; marqueur `learny-test-only` ignoré ; `isForbiddenSecretFile` (`.env`, `.env.local`, `apps/web/.env.production`, `key.pem` → vrai ; `.env.example`, `env.ts` → faux) ; aperçu masqué = 4 caractères + `…`.
- **Intégration** — `tools/security/test/integration/hooks.test.ts` — `describe('[SPEC-002] git hooks')` :
  - crée un dépôt temporaire (`fs.mkdtemp` dans `os.tmpdir()`), `git init -b main`, identité locale, `core.hooksPath` pointant vers une copie de `.husky/` du dépôt réel dans laquelle `pnpm exec` est remplacé par l'exécution des binaires du dépôt réel (`<ROOT>/node_modules/.bin/commitlint --config <ROOT>/commitlint.config.ts`) ; vérifie CA-2 (code de sortie de `git commit`) ;
  - indexe un fichier contenant une clé factice réelle → `tsx tools/security/check-secrets.ts --staged` exécuté dans le dépôt temporaire renvoie 1 et la sortie ne contient pas la clé complète ; indexe `.env` → 1 ; indexe une valeur avec `learny-test-only` → 0 (CA-3) ;
  - dans le dépôt réel : `git config core.hooksPath` = `.husky/_` et contenus des hooks (CA-4).
- **End-to-end** — `apps/web/e2e/specs/p0/spec-002.spec.ts` :
  - `test('vérifie des messages de commit @SPEC-002')` : saisit `feat(SPEC-002): ajoute X` → « Message conforme » ; saisit `feat: ajoute X` → « Message refusé » et une erreur contenant `scope-empty` ; saisit `merge(SPEC-006): Application web : configuration de base, santé et pages de démonstration` → « Message conforme ».
  - `test('détecte un secret @SPEC-002')` : saisit `ANTHROPIC_API_KEY=sk-ant-api03-` + 30 `A` → « 1 secret(s) détecté(s) » et l'aperçu `sk-a…` ; saisit `sk-ant-learny-test-only-0000000000000000` → « Aucun secret détecté. ».
  - `test('pages SDD désactivées en production @SPEC-002')` : `request.post('/api/v1/_dev/commit-check')` avec un corps invalide `{}` → 400 `VALIDATION_FAILED`.
- **Visuel** — `test('démonstration SPEC-002 conforme @SPEC-002 @visual')` : ordre des sections `spec-002-hooks`, `spec-002-commit`, `spec-002-secrets`, `spec-002-types`, libellés exacts, puis `toHaveScreenshot('spec-002-demo.png', { fullPage: true, maxDiffPixelRatio: 0.01 })`.
- **Non-régression** : rejouer `@SPEC-001` et `[SPEC-001]`.

| Critère | Tests |
|---|---|
| CA-1 | `commit-rules.test.ts` (it.each EF-6) |
| CA-2 | `hooks.test.ts` (dépôt temporaire, commit-msg) |
| CA-3 | `secret-patterns.test.ts` ; `hooks.test.ts` (check-secrets) ; e2e « détecte un secret » |
| CA-4 | `hooks.test.ts` (dépôt réel) |
| CA-5 | e2e « vérifie des messages de commit », « détecte un secret » ; test `@visual` |
| CA-6 | `commit-rules.test.ts` (titres du catalogue) |

## 13. Preuves attendues

`evidence/SPEC-002/` : rapports, `acceptance.md`, vidéos des trois tests e2e, captures finales ; le commit `evidence(SPEC-002): preuves de validation` et le commit de fusion `merge(SPEC-002): Hooks Git, conventions de commit et protection des secrets` créés par `complete.mjs` sont eux-mêmes une preuve du fonctionnement des hooks (visible dans `git log`).

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7) ; de plus : `git commit --no-verify` n'est utilisé à aucun moment ; `pnpm exec tsx tools/security/check-secrets.ts --all` renvoie 0 sur le dépôt ; `CONTRIBUTING.md` existe.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0051 (versionnement), ADR-0100 (identité de l'agent).
- ADR créé : **ADR-0103** — compléments aux conventions de commit (type `merge` autorisé car produit par `complete.mjs`, casse du sujet libre, 100 caractères pour la description d'une fusion, portée par motif), détection des secrets à double contrôle (gitleaks facultatif + analyseur intégré) et mot témoin `learny-test-only` pour les valeurs factices.
- ADR créé pendant l'implémentation : **ADR-0222** (une trouvaille par secret, démonstration serveur + formulaires client, longueur réelle de CL-1, typage des règles commitlint).
- Hypothèse : le porteur du projet active lui-même la protection de branche sur GitHub ; la spécification se limite à la documenter.
