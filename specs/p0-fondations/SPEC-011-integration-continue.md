---
id: SPEC-011
title: Intégration continue
phase: P0
priority: V1
depends_on: [SPEC-002, SPEC-004, SPEC-008]
business_rules: []
screens: []
adrs: [ADR-0052, ADR-0226]
visual: demo
---

# SPEC-011 — Intégration continue

## 1. Objectif

Compléter le workflow GitHub Actions existant pour que chaque changement du référentiel et du code soit audité, construit et testé avec preuves conservées. La CI doit exécuter les mêmes validations que le poste local, en modes simulés et avec une horloge fixe.

## 2. Contexte

`.github/workflows/ci.yml` possède déjà les jobs audit, secrets, qualité, intégration et e2e. ADR-0052 fixe GitHub Actions, l'activation des jobs applicatifs dès que `pnpm-lock.yaml` existe et la responsabilité du porteur du projet pour la protection de `main`. Lire `docs/engineering/testing.md` §1–§7, `docs/engineering/git.md` §5, `docs/architecture/overview.md` §6, `specs/checkpoints.md` et les scripts de SPEC-002, 004 et 008. La CI n'utilise aucune clé de fournisseur IA, de paiement ou d'e-mail réel.

## 3. Dépendances

- **SPEC-002** : hooks/commitlint, gitleaks et analyseur local de secrets.
- **SPEC-004** : reporters JSON/JUnit, vidéos Playwright, captures et tests visuels.
- **SPEC-008** : Supabase CLI local, extensions et commandes `db:reset`/`db:seed:demo`.
- **Services GitHub** : exécution Actions et stockage temporaire d'artefacts ; une panne du service GitHub est externe et ne justifie jamais une preuve verte inventée.

## 4. Règles métier couvertes

Aucune règle produit `BR-*`. Cette spécification applique ADR-0052 et les conditions communes de validation de `docs/engineering/testing.md` §7.

## 5. Exigences fonctionnelles

- **EF-1** — Les événements `push` sur `main`, `spec/**`, `fix/**`, `release/**`, les PR et `workflow_dispatch` lancent l'audit SDD et la recherche de secrets sans exception. Aucun job applicatif n'est omis quand `pnpm-lock.yaml` existe.
- **EF-2** — Le job qualité exécute `pnpm install --frozen-lockfile`, lint, typecheck, build et unitaires avec couverture ; l'intégration démarre Supabase local, remet la base à zéro et exécute `pnpm test:int` ; e2e démarre Supabase, charge la seed de démonstration et exécute Chromium avec vidéo, axe et tests `@visual`. Un échec de l'une de ces commandes rend la CI rouge.
- **EF-3** — Les rapports de chaque niveau, traces, captures et vidéos sont envoyés en artefacts même si le job échoue. Une pièce absente est signalée et ne devient pas une preuve d'acceptation. La durée de conservation est définie explicitement dans le workflow.
- **EF-4** — Le job secrets exécute gitleaks sur l'historique et l'analyseur de SPEC-002 sur les fichiers du dépôt ; aucun secret de test factice ne déclenche un faux positif grâce au marqueur `learny-test-only`.
- **EF-5** — `pnpm audit` s'exécute sur le lockfile avec un seuil de gravité documenté ; un résultat bloquant échoue, sans option de contournement silencieuse. Le rapport brut reste un artefact.
- **EF-6** — Un contrôle de titre PR applique le format `docs/engineering/git.md` et ADR-0103, y compris `merge(SPEC-xxx): ...` si un titre automatisé est utilisé. La protection de branche reste une action du porteur du projet documentée dans `CONTRIBUTING.md`, non simulée par le workflow.
- **EF-7** — Les caches pnpm et Turbo accélèrent les jobs sans mettre en cache `.env`, tokens, preuves de test ou résultat d'audit. Une erreur de cache n'empêche pas l'exécution des tests.
- **EF-8** — Le workflow fixe `CLOCK_FIXED_AT=2026-11-11T12:20:00Z`, `LLM_MODE=mock`, `STRIPE_MODE=mock`, `EMAIL_MODE=memory`, `PUSH_MODE=mock` et `ENABLE_SDD_PAGES='true'`. La valeur actuelle `'1'` est corrigée pour correspondre au garde de SPEC-001/006 ; un test vérifie cette cohérence.
- **EF-9** — `pnpm ci:check` valide localement la syntaxe des workflows via `actionlint` et les invariants des jobs. Si `act` est disponible, un essai local du workflow peut être exécuté ; sinon la validation syntaxique suffit pour ce contrôle local, sans prétendre qu'une exécution GitHub a eu lieu.

## 6. Exigences techniques

- **ET-1** — `.github/workflows/ci.yml` garde `permissions: contents: read` et limite les permissions supplémentaires au seul job qui en a besoin. Les actions tierces sont épinglées à une version majeure au minimum selon ADR-0052 ; une empreinte complète est préférable si compatible.
- **ET-2** — Chaque job applicatif dépend de la détection du lockfile de l'audit et redéclare `pnpm install --frozen-lockfile` dans son environnement isolé. Le job e2e installe Chromium et ses dépendances système, la locale française et les polices requises.
- **ET-3** — `ci:check` parse les YAML, vérifie les noms des scripts réellement présents dans `package.json`, les variables imposées, le `if: always()` des artefacts et l'absence de `continue-on-error` sur un contrôle obligatoire.
- **ET-4** — Un workflow `pr-title.yml` utilise un validateur de titre avec configuration commune de commitlint ; il ne reçoit aucun droit d'écriture ni secret tiers.
- **ET-5** — Le job de sécurité sauvegarde le rapport de `pnpm audit` et de gitleaks avec masquage des éventuelles valeurs détectées dans l'artefact publiable. Ne pas envoyer la totalité du fichier source d'un secret potentiel.
- **ET-6** — Les tests de la spécification construisent un dossier temporaire contenant les workflows, scripts et fichiers nécessaires ; ils n'appellent pas l'API GitHub et ne modifient pas la configuration de `origin`.

## 7. Comportements attendus et cas limites

- **CL-1** — Pas de lockfile avant SPEC-001 : audit et secrets tournent, jobs applicatifs sont omis explicitement ; dès sa présence, ils tournent.
- **CL-2** — Une étape de test échoue : artefacts envoyés, job rouge et aucun statut de réussite ajouté par une étape ultérieure.
- **CL-3** — `ENABLE_SDD_PAGES='1'` dans le workflow : `ci:check` échoue.
- **CL-4** — `actionlint` indisponible : `ci:check` échoue avec instruction d'installation ; `act` absent est seulement signalé.
- **CL-5** — Cache corrompu : installation propre possible ; tests et audit ne sont pas sautés.
- **CL-6** — Fichier `.env` accidentel : job secrets échoue et son rapport masqué reste consultable.
- **CL-7** — Migrations Supabase en erreur : job intégration et e2e échouent avant les tests, sans résultat prétendu vert.

## 8. Instructions d'implémentation

1. Normaliser `ci.yml` : variables, ordre, caches, versions, artefacts et contrôles de sécurité ; corriger `ENABLE_SDD_PAGES`. Commit `ci(SPEC-011): complète les jobs de qualité et de preuve`.
2. Ajouter `pr-title.yml`, `tools/ci/check-workflows.mjs` et `pnpm ci:check` ; brancher actionlint. Commit `ci(SPEC-011): valide les workflows et titres de PR`.
3. Écrire les tests unitaires du validateur, les tests d'intégration sur workflow temporaire et la page SDD présentant la matrice réelle des jobs. Commit `test(SPEC-011): vérifie la matrice CI et ses garde-fous`.
4. Exécuter `ci:check`, puis si possible le workflow avec `act` et enregistrer ce qui a effectivement été exécuté. L'exécution GitHub distante, si elle a lieu, fournit une preuve séparée.
5. Valider la spécification avec `validate.mjs` et documenter les limites observées dans `acceptance.md`.

## 9. Fichiers et composants concernés

- **Créés** : `.github/workflows/pr-title.yml`, `tools/ci/check-workflows.mjs`, `tools/ci/check-workflows.test.ts`, `tools/ci/test/integration/workflows.test.ts`, `apps/web/components/sdd-demos/spec-011.tsx`, `apps/web/e2e/specs/p0/spec-011.spec.ts`.
- **Modifiés** : `.github/workflows/ci.yml`, `package.json`, `CONTRIBUTING.md`, `apps/web/app/%5Fdev/sdd/registry.ts`, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `pnpm-lock.yaml`, `tools/sdd/audit.mjs`, scripts de test, `tools/security/check-secrets.ts`, configuration Playwright.

## 10. Interface et conformité visuelle

Mode `demo` : `/_dev/sdd/SPEC-011` affiche « Intégration continue », une liste ordonnée « Audit → Qualité → Intégration → E2E », les contrôles secrets et titres PR, puis les modes de test et les artefacts. Chaque étape est étiquetée « configurée » ; aucun résultat GitHub n'est inventé. `data-testid` : `spec-011-jobs`, `spec-011-security`, `spec-011-modes`, `spec-011-artifacts`. Le lien vers `ci.yml` est du texte de dépôt, sans URL de run fictive. Vérifier jetons, ordre, axe et captures desktop/mobile avec `toHaveScreenshot('spec-011-demo.png', { maxDiffPixelRatio: 0.01 })`.

## 11. Critères d'acceptation

- **CA-1** — Sur lockfile présent, la matrice comprend audit, secrets, lint, typecheck, build, unitaires, intégration Supabase, e2e Chromium, visuel et artefacts même en échec.
- **CA-2** — Les modes et l'horloge fixés sont corrects ; `ENABLE_SDD_PAGES='1'` et `continue-on-error` sur une validation obligatoire sont refusés.
- **CA-3** — Un titre de PR invalide est refusé, un titre conforme accepté ; gitleaks et l'analyseur intégré sont tous deux configurés.
- **CA-4** — `ci:check` valide les workflows et détecte au moins une erreur de syntaxe et un script pnpm inexistant.
- **CA-5** — La page SDD représente la configuration réelle, passe axe, vidéo et captures desktop/mobile.

## 12. Plan de tests

- **Unitaires** — `tools/ci/check-workflows.test.ts`, `describe('[SPEC-011] workflow rules')` : scripts, modes, lockfile, artefacts, étapes critiques et titres PR (CA-1 à CA-4).
- **Intégration** — `tools/ci/test/integration/workflows.test.ts`, `describe('[SPEC-011] actionlint')` : lancer `ci:check` sur les vrais YAML puis sur une copie malformée, vérifier code de sortie ; une exécution `act` est facultative et rapportée comme telle (CA-4).
- **End-to-end** — `apps/web/e2e/specs/p0/spec-011.spec.ts`, `test('inspecte la matrice CI @SPEC-011')` : ouvrir la page, vérifier les jobs et modes, conserver la vidéo (CA-5).
- **Visuel** — `test('matrice CI conforme @SPEC-011 @visual')` : ordre des blocs, jetons, axe, captures desktop/mobile ≤ 1 % (CA-5).
- **Non-régression** — `[SPEC-002]`, `[SPEC-004]`, `[SPEC-008]` et leurs e2e.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; intégration |
| CA-2 | unitaires |
| CA-3 | unitaires ; intégration |
| CA-4 | intégration |
| CA-5 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-011/` conserve rapports de `ci:check`/actionlint, test Vitest, vidéo/captures et `acceptance.md`. Les artefacts GitHub sont liés seulement si un run réel existe. Le rapport distingue validation YAML locale, essai `act` et run GitHub.

## 14. Définition de terminé

Les conditions de `docs/engineering/testing.md` §7 passent ; aucune validation obligatoire n'est ignorée, les modes de test ne contactent aucun service payant et `ci:check` est vert. L'activation distante de la protection de `main` reste documentée selon ADR-0052.

## 15. Décisions et hypothèses

ADR-0052 fixe GitHub Actions, la matrice initiale et la propriété de la protection de branche. SPEC-009 impose `ENABLE_SDD_PAGES=true` dans l'exemple ; le workflow utilise la même valeur pour ses tests e2e. Aucun secret de CI de production n'est nécessaire à cette spécification. ADR-0226 fixe l'emplacement du test unitaire `tools/ci/check-workflows.test.ts` (ajouté au projet Vitest unitaire), les durées de conservation des artefacts (14 jours de test, 30 jours de sécurité) et les modalités d'installation d'`actionlint` (obligatoire) et d'`act` (facultatif).
