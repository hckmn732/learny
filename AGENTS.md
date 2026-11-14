# AGENTS.md — instructions pour tout agent IA

Ce dépôt est un **référentiel Spec-Driven Development** : il contient tout ce qu'il faut pour implémenter, tester, prouver et livrer **Learny** (application web d'apprentissage intensif pilotée par un tuteur IA) **en totale autonomie**. Tu n'as besoin d'aucune autre source que ce dépôt.

## Règle absolue : zéro intervention humaine

- Ne **jamais** demander à l'utilisateur une clarification, une décision technique, une validation intermédiaire ou l'autorisation de continuer.
- Toute ambiguïté se résout avec le protocole de `docs/engineering/sdd-process.md` §4 et se consigne dans un ADR (`node tools/sdd/adr.mjs new …`).
- Une dépendance externe réellement inaccessible : implémenter ce qui est faisable (modes mock), consigner le blocage (`node tools/sdd/fail.mjs SPEC-xxx "raison" --external`) et continuer les tâches indépendantes. Ne jamais inventer de résultat ni contourner une restriction de sécurité.

## Ordre de lecture

1. Ce fichier.
2. `docs/engineering/sdd-process.md` — la boucle d'exécution et la reprise.
3. `docs/product/vision.md`, `docs/product/business-rules.md` (règles `BR-*`, normatives), `docs/product/screens.md`, `docs/product/glossary.md`.
4. `docs/architecture/overview.md`, `data-model.md`, `api.md`, `ai.md`.
5. `docs/engineering/conventions.md`, `testing.md`, `git.md`.
6. `docs/adr/README.md` — **les ADR priment** sur tout autre document.
7. La spécification à exécuter (`specs/<phase>/SPEC-xxx-*.md`) et sa maquette (`design/maquettes/*.dc.html`, ouvrir `design/maquettes/index.html`).

Priorité en cas de conflit : ADR > business-rules > spécification > maquette > autres documents > `docs/legacy/` (historique, non normatif).

## La boucle

```bash
node tools/sdd/next.mjs                 # prochaine action : REPRENDRE / DÉMARRER / CHECKPOINT / TERMINÉ
node tools/sdd/start.mjs SPEC-xxx       # vérifie les dépendances, branche spec/…, verrou
# … implémenter + tests (commits atomiques feat/test(SPEC-xxx): …)
node tools/sdd/validate.mjs SPEC-xxx    # lint, typecheck, build, unit, int, e2e+vidéo, visuel, critères → evidence/
node tools/sdd/complete.mjs SPEC-xxx    # statut done, preuves commitées, fusion --no-ff dans main, push si origin
node tools/sdd/checkpoint.mjs CP-n      # quand next.mjs l'indique
node tools/sdd/status.mjs               # régénère progress/PROGRESS.md
node tools/sdd/audit.mjs                # cohérence du référentiel
```

Répéter jusqu'à `TERMINÉ` (V1 au checkpoint CP-8 → `v1.0.0`, V2 au checkpoint CP-9 → `v2.0.0`).

## Parallélisme, surveillance et relance

Le travail en parallèle est **autorisé et encouragé quand il est sûr**, jamais au détriment du déterminisme.

- **Un worktree par spécification** : `git worktree add ../learny-wt-<id> spec/SPEC-xxx-…`, puis `start.mjs` dans ce worktree (un verrou `.sdd/lock.json` par worktree). Le worktree principal reste sur `main`.
- **Quand paralléliser** : specs `ready` aux dépendances satisfaites, sans recouvrement de fichiers sensible (contrats/index, routes, `messages/fr.ts`, registres de jobs, planning). En cas de recouvrement probable, limiter à deux specs et fusionner au fur et à mesure ; sinon sérialiser.
- **Qui fusionne** : seul l'agent principal fusionne (`--no-ff`), pousse, tague et maintient l'app QA. Les agents de spec travaillent uniquement dans leur worktree et terminent par `complete.mjs SPEC-xxx --no-merge --no-push`.
- **Base locale partagée** : toute commande qui touche la base (tests d'intégration, e2e, reset, seed) est sérialisée avec `flock /tmp/learny-sdd-db.lock <commande>`. Deux suites ne partagent jamais la même base en parallèle.
- **E2E isolés** : `PLAYWRIGHT_REUSE_SERVER=0` et un `PLAYWRIGHT_PORT` distinct par exécution parallèle ; ne jamais lancer deux campagnes E2E en parallèle sur la même base.
- **Surveillance** : vérifier chaque agent au moins **toutes les 15 minutes** (`git log --oneline`, `git status --short` et présence de `evidence/SPEC-xxx/` dans son worktree). Ne pas relire son travail en continu ni modifier ses fichiers pendant qu'il travaille.
- **Relance (« secouer »)** : après **15 minutes sans nouveau commit**, envoyer un message court et actionnable : arrêter l'exploration, committer par lots logiques, lancer une validation filtrée, compléter `acceptance.md`, puis `complete.mjs --no-merge --no-push`. Deux relances au maximum par phase de blocage ; si l'agent ne progresse toujours pas après ~30 minutes, l'agent principal reprend la main dans le worktree (ou réaffecte) et consigne le blocage si nécessaire.
- **Fin de spec** : l'agent principal fusionne, pousse, vérifie la CI et relance l'app QA. Un checkpoint n'est lancé que lorsque toutes les specs de la phase sont `done` et la CI verte.

Détail opérationnel et critères : `docs/engineering/sdd-process.md` §2 bis et `docs/engineering/git.md` §1.1.

## Exigences de qualité non négociables

- Une spécification n'est `done` que si **toutes** ses validations passent : lint, typecheck, build, tests unitaires `[SPEC-xxx]`, intégration `[SPEC-xxx]`, e2e Playwright `@SPEC-xxx` avec vidéo, au moins un test `@visual`, tous les critères `CA-x` cochés ✅ avec preuve dans `evidence/SPEC-xxx/acceptance.md`, aucune régression.
- Conformité visuelle aux maquettes selon `docs/engineering/testing.md` §6 (ADR-0034).
- Tests déterministes : horloge figée au 2026-11-11T12:20:00Z (ADR-0047), IA simulée `LLM_MODE=mock` (ADR-0048).
- Accessibilité WCAG 2.2 AA, sécurité (RLS partout, secrets côté serveur), performances (ADR-0041).

## Interdits

Modifier `design/maquettes/` ou `docs/legacy/` ; inventer une preuve ; affaiblir un test pour le faire passer ; créer un dépôt distant ou modifier les remotes ; pousser en force ; réécrire l'historique de `main` ; committer un secret ; implémenter un élément hors périmètre (ADR-0005) ; utiliser `Date.now()`/`new Date()` hors de l'horloge injectable.

## Git

Dépôt distant : `origin` = `https://github.com/hckmn732/learny.git` (créé par le porteur du projet). Conventions : `docs/engineering/git.md` (branches `spec/SPEC-xxx-slug`, Conventional Commits avec la spécification en portée, fusions `--no-ff`, tags `cp-n` et SemVer).
