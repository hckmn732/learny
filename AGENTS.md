# AGENTS.md — instructions pour tout agent IA

Ce dépôt est un **référentiel Spec-Driven Development** : il contient tout ce qu'il faut pour implémenter, tester, prouver et livrer **Learny** (application web d'apprentissage intensif pilotée par un tuteur IA) **en totale autonomie**. Tu n'as besoin d'aucune autre source que ce dépôt.

## Piste « mode-simple » (ADR-4001)

Mode simple « Dépose ton cours » (ADR-4003) : l'apprenant dépose un ou plusieurs documents et Learny en fait une formation complète. La piste part de la branche `mobile` et y fusionne ; ADR à partir d'ADR-4001, phases à partir de P40, spécifications à partir de SPEC-4001, checkpoints à partir de CP-40. Lancer l'outillage avec `SDD_TRACK=mode-simple`.

- **Le mobile est iso web** (ADR-4002, remplace ADR-3002) : toute fonctionnalité nouvelle est livrée en même temps sur le web et sur le mobile, avec parité prouvée.
- Lire d'abord `docs/product/mode-simple.md` et les maquettes `design/mode-simple/index.html`.

## Branche `mobile` : piste « mobile » (ADR-3001)

Sur la branche `mobile` (partie de `main` le 2026-11-22), la piste pilotée par `node tools/sdd/next.mjs` est **`mobile`** (`activeTrack`) : application Android et iOS en React Native + Expo (ADR-1004, ADR-3001 à ADR-3011), phases P30 → P35, SPEC-3001 → SPEC-3502, checkpoints CP-30 → CP-35, ADR numérotés à partir d’ADR-3001. Les branches de spécification partent de `mobile` et y sont fusionnées.

- **Canevas obligatoire** : lire `docs/architecture/mobile/README.md` avant toute spec SPEC-3xxx, puis la spécification et la maquette `design/app-mobile/` (lue avec les corrections d’ADR-3003, jamais modifiée).
- **Un seul écrivain par zone** : la piste mobile n’écrit que dans `apps/mobile/` et les zones listées par ADR-3001 §4 ; aucune modification du backend ni du contrat avant P35 (qui exige CP-23).
- Fusionner `main` dans `mobile` (`node tools/sdd/sync-main.mjs`) à chaque checkpoint et après chaque checkpoint de la piste Python.
- Validation : `validate.mjs` exécute Vitest, Jest (`pnpm test:mobile`) et Maestro (`pnpm test:e2e:mobile`) pour les specs mobiles (ADR-3004, livré par SPEC-3001).
- Le reste de ce fichier décrit l’état de `main`, qui s’applique tel quel à la piste mobile.

## Backend : un seul runtime, Python (piste « python-migration »)

Décision du porteur du projet (ADR-2001), menée à son terme par SPEC-2302 et actée par ADR-2043 : le backend TypeScript a été **retiré**. Il n'y a plus de coexistence, plus de relais, plus de `api/ownership.yaml`, plus d'Inngest, plus de paquet serveur TypeScript.

- **Ce qui sert les requêtes** : `apps/api`, façade FastAPI (`uvicorn learny_api.main:app`) qui sert **tout** le contrat — 156 opérations d'`api/openapi.yaml` et 11 routes spéciales — et `apps/worker`, worker maison sur l'outbox PostgreSQL (`python -m learny_worker`, 23 consommateurs, 2 crons). Le web Next.js reste un client pur de l'API. Décisions : ADR-2001 à ADR-2010, ADR-2011 (canevas), ADR-2012 (pipeline), ADR-2043 (retrait).
- **Ce qui reste en TypeScript** : `packages/contracts` (source unique du contrat, export `api/openapi.yaml`), les clients (`apps/web`, `apps/mobile` sur la branche `mobile`) et leurs dépendances (`api-client`, `api-sdk`, `bricks`, `ui`, `i18n`, `config`, `core`, `domain`), `packages/db` (schéma Drizzle, migrations, RLS), l'outillage et les suites e2e.
- `node tools/sdd/next.mjs` pilote la piste `python-migration` (P20 → P23, SPEC-2001 → SPEC-2302, checkpoints CP-20 → CP-23) ; la piste se clôt par CP-23. Les ADR de la piste sont numérotés à partir d'ADR-2001.
- **Specs gelées** : piste `produit` (SPEC-808, SPEC-901 → 908, CP-7 → CP-9) et piste `migration` Hono (SPEC-1101 → SPEC-1302, CP-10 → CP-13, branche `migration`, worktree `learny-wt-migration`). Ne jamais les démarrer, les modifier ni les supprimer.
- **Invariant absolu : conserver le fonctionnel existant** (ADR-1001, précisé par ADR-2008). Aucune assertion d'oracle (e2e, visuel, accessibilité, contrat HTTP) modifiée, aucune ligne de base visuelle régénérée, aucun libellé, contrat d'API, code d'erreur ou comportement changé. Un écart est une anomalie à corriger dans le code Python, jamais dans le test.
- **Garde-fous de complétude** (remplacent la table de propriété supprimée) : `apps/api/tests/unit/test_route_coverage.py` (`[SPEC-2302]`) compare l'inventaire, la table de routes générée et les routes installées ; `node tools/migration/inventory.mjs --check` échoue en cas de dérive et `--runtime` imprime le verdict (toutes les opérations, routes spéciales, consommateurs et crons sont Python ; aucun chemin backend TypeScript). Une opération sans handler est refusée au démarrage de la façade.
- Jobs : worker Python maison sur outbox PostgreSQL, Inngest retiré (ADR-2006, ADR-2014). Hébergement : Coolify (ADR-2007). Le staging est fourni par le porteur pour les preuves de charge, canary, rollback et restauration ; sinon blocage `--external` (ADR-2009).
- **Canevas technique obligatoire** (ADR-2011) : avant toute intervention sur le backend, lire `docs/architecture/python-backend/00-conventions.md` puis le plan de la phase (`P20-plan.md` … `P23-plan.md`) et le suivre pas à pas. Le backend Python est écrit **en anglais** (code, commentaires, journaux, tests) ; seuls les textes vus par l'utilisateur restent en français, copiés à l'identique du TypeScript dans `learny/shared/locale_fr/` et les gabarits. Pas de sur-ingénierie : la liste des motifs autorisés et interdits (§4 des conventions) est contraignante.

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
8. Pour le backend : `docs/architecture/python-backend/README.md`, `00-conventions.md` et le plan de la phase.

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

Dépôt distant : `origin` = `https://github.com/hckmn732/learny.git` (créé par le porteur du projet). Conventions : `docs/engineering/git.md` (branches `spec/SPEC-xxx-slug`, Conventional Commits avec la spécification en portée, fusions `--no-ff`, tags `cp-n` et SemVer ; branche `migration` et ses spécifications `spec/SPEC-1xxx-…` : §1.0).
