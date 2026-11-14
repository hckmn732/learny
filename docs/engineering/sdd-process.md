# Processus SDD et boucle d'exécution autonome

Ce document décrit comment un agent IA livre Learny de bout en bout **sans jamais solliciter l'utilisateur**. Les règles de comportement de l'agent sont dans `AGENTS.md` (lu en premier).

## 1. Cycle de vie d'une spécification

```
pending ──(dépendances done + checkpoint de phase précédente réussi)──▶ ready
ready ──start.mjs──▶ in_progress ──validate.mjs OK──▶ complete.mjs ──▶ done
in_progress ──validate.mjs KO──▶ corriger ──▶ validate.mjs … (tentatives illimitées tant que des progrès sont faits)
in_progress ──fail.mjs (5e échec ou --external)──▶ blocked (anomalie consignée, dépendants « dependency_blocked »)
```

États stockés dans `progress/state.json` (seuls les scripts `tools/sdd/*.mjs` l'écrivent). États dérivés : `ready`, `waiting`, `dependency_blocked`.

## 2. Boucle (à répéter jusqu'à « TERMINÉ »)

1. **Identifier** : `node tools/sdd/next.mjs` → `REPRENDRE`, `DÉMARRER`, `CHECKPOINT`, `TERMINÉ` ou `AUCUNE SPÉCIFICATION EXÉCUTABLE`.
2. **Vérifier les dépendances et démarrer** : `node tools/sdd/start.mjs SPEC-xxx` (refuse si dépendances non terminées ; crée/reprend la branche `spec/SPEC-xxx-slug` et le verrou `.sdd/lock.json`).
3. **Lire** : la spécification, puis les documents qu'elle référence (règles métier, ADR, écrans, maquette, data-model, api, ai, conventions, testing).
4. **Implémenter** les exigences en suivant la section 8 ; écrire les tests de la section 12 en même temps ; committer par étapes atomiques (`feat(SPEC-xxx): …`, `test(SPEC-xxx): …`).
5. **Exécuter les tests** localement au fil de l'eau (`pnpm test:unit -t SPEC-xxx`, `pnpm test:int -t SPEC-xxx`, `pnpm test:e2e --grep @SPEC-xxx`).
6. **Corriger** automatiquement toute anomalie (y compris régressions d'autres spécifications) jusqu'au vert.
7. **Valider et générer les preuves** : `node tools/sdd/validate.mjs SPEC-xxx` (lint, typecheck, build, unitaires, intégration, e2e avec vidéo, visuel, critères) → `evidence/SPEC-xxx/`.
8. **Vérifier les critères d'acceptation** : compléter `evidence/SPEC-xxx/acceptance.md` (✅ + preuve par critère) ; relancer `validate.mjs` jusqu'à `acceptance` réussi.
9. **Enregistrer les preuves et mettre à jour le suivi** : `node tools/sdd/complete.mjs SPEC-xxx` (commit des preuves, statut `done`, PROGRESS.md régénéré).
10. **Versionner** : `complete.mjs` fusionne `--no-ff` dans `main` et pousse sur `origin` si configuré (ADR-0051).
11. **Passer à la suite** : retour à l'étape 1. Si `CHECKPOINT` : `node tools/sdd/checkpoint.mjs CP-n` ; en cas d'échec, corriger sur `fix/<SPEC>-<slug>` puis relancer.

## 2 bis. Parallélisme contrôlé, surveillance et relance

### 2 bis.1 Quand paralléliser

Une spécification peut être exécutée en parallèle si **toutes** ces conditions sont réunies :

1. elle est `ready` (dépendances `done`, checkpoint de phase précédente réussi) ;
2. elle ne partage pas de fichier à fort risque de conflit avec une autre spec en cours : `packages/contracts/src/{index,routes,events}.ts`, `packages/services/src/index.ts`, `packages/jobs/src/index.ts`, `apps/web/lib/quiz-grade-registry.ts`, `apps/web/messages/fr.ts`, `packages/services/src/planning/index.ts`, `progress/state.json` ;
3. elle peut être validée sans lancer deux suites sur la base locale en même temps.

En pratique : deux specs en parallèle au maximum quand elles touchent des domaines distincts ; au-delà, ou dès qu'un fichier commun est modifié, fusionner rapidement puis relancer. En cas de doute, sérialiser.

### 2 bis.2 Isolation

- **Worktree dédié** : `git worktree add ../learny-wt-<id> spec/SPEC-xxx-<slug>`, puis `node tools/sdd/start.mjs SPEC-xxx` **dans ce worktree** (le verrou SDD est local au worktree). Le dépôt principal reste sur `main`.
- **Variables** : `export PATH="$HOME/.local/bin:$PATH"`, `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`, `APP_ENV=local`. Aucun test ne dépend d'un artefact local non commité (`apps/web/.env.local`).
- **Base partagée** : préfixer toute commande base par `flock /tmp/learny-sdd-db.lock`. Ne jamais lancer `test:int` ou `test:e2e` en parallèle, ni pendant un `db:reset`/`db:seed:demo`.
- **E2E** : `E2E_SKIP_BUILD=1` si le build est à jour, `PLAYWRIGHT_REUSE_SERVER=0` et `PLAYWRIGHT_PORT=31xx` unique pour éviter de réutiliser le serveur d'une autre exécution.
- **Agents** : chaque agent de spec commite `feat/test/docs/evidence(SPEC-xxx)` dans son worktree, lance `validate.mjs` filtré, complète `evidence/SPEC-xxx/acceptance.md`, puis `complete.mjs SPEC-xxx --no-merge --no-push`.

### 2 bis.3 Surveillance et relance

- **Cadence** : vérifier chaque agent au moins toutes les 15 minutes. Contrôles : `git log --oneline -5`, `git status --short` (nombre de fichiers modifiés), présence et fraîcheur de `evidence/SPEC-xxx/`, et progression des tests dans la réponse de l'agent.
- **Ne pas dupliquer** : ne pas travailler sur les mêmes fichiers que l'agent, ne pas relire son travail en boucle ; l'agent principal peut avancer sur des tâches indépendantes (CI, QA, documentation, autres specs sérialisées).
- **Relance** : après **15 minutes sans nouveau commit**, envoyer une consigne courte et concrète : arrêter l'exploration, committer par lots logiques, lancer **une** validation filtrée, corriger uniquement le premier bloquant, compléter `acceptance.md`, puis `complete.mjs --no-merge --no-push`. Maximum deux relances par phase de blocage.
- **Reprise** : si aucun progrès après ~30 minutes (deux intervalles), l'agent principal reprend la main dans le worktree (inspection de `git status`, commits restants, validation) ou réaffecte la spec. Un agent bloqué sur une dépendance externe applique `fail.mjs SPEC-xxx "raison" --external` et l'agent principal continue les specs indépendantes.
- **Clôture** : seul l'agent principal fusionne (`git merge --no-ff`), pousse, vérifie la CI et relance l'app QA. Il nettoie ensuite les worktrees terminés (`git worktree remove …`) et ne lance un checkpoint qu'avec toutes les specs de la phase `done` et la CI verte.

## 3. Reprise automatique après échec

- **Interruption** (crash, contexte épuisé, redémarrage) : `next.mjs` renvoie `REPRENDRE` pour la spécification `in_progress` ; `start.mjs` rebascule sur sa branche ; l'agent relit la spécification, inspecte `git log`/`git status` de la branche et `progress/state.json` (`lastError`, `validations`) puis reprend à l'étape 4.
- **Échec de validation** : lire `lastError`, corriger, relancer. Si l'agent estime ne plus progresser, `node tools/sdd/fail.mjs SPEC-xxx "raison"` incrémente les tentatives ; à 5, la spécification passe `blocked`.
- **Dépendance externe inaccessible** (service tiers, identifiants de production absents, réseau) : implémenter tout ce qui est faisable avec les modes mock, puis `fail.mjs SPEC-xxx "raison" --external` (blocage consigné dans `progress/blockers.md`) ; ne jamais inventer de résultat ni contourner une restriction de sécurité ; continuer avec les spécifications indépendantes.
- **Conflit de fusion** : le résoudre sur `main` en préservant les deux intentions, rejouer les tests concernés, committer `fix(SPEC-xxx): résout le conflit de fusion`.

## 4. Décisions pendant l'implémentation

Toute ambiguïté se résout **sans solliciter l'utilisateur**, dans cet ordre : ADR existant → règles métier → spécification → maquette → documents d'architecture et d'ingénierie → standards reconnus (WCAG, OWASP, RFC, documentation officielle des bibliothèques) → cohérence avec le reste du produit. La décision prise est consignée : `node tools/sdd/adr.mjs new "Titre" --context "…" --decision "…" --links "SPEC-xxx"`, puis référencée dans la section 15 de la spécification (modification commitée `docs(SPEC-xxx): …`).

## 5. Ce qui est interdit

- Demander une clarification, une validation ou une autorisation à l'utilisateur.
- Modifier `design/maquettes/` ou `docs/legacy/`.
- Inventer une preuve, un résultat de test, une mesure ou une donnée externe.
- Désactiver, ignorer ou affaiblir un test pour le faire passer (sauf test erroné, corrigé avec justification dans le commit).
- Créer un dépôt distant, modifier les remotes, pousser en force, réécrire l'historique de `main`.
- Committer un secret.

## 6. Suivi

- `progress/PROGRESS.md` : tableau de bord généré (total, terminées, en cours, en attente, bloquées, % d'avancement global et V1, phases et checkpoints, validations par spécification, anomalies).
- `progress/anomalies.md`, `progress/blockers.md` : journaux.
- `progress/audit.md` : dernier audit du référentiel (`node tools/sdd/audit.mjs --write`).
