---
id: SPEC-003
title: Outillage SDD exécutable et intégré
phase: P0
priority: V1
depends_on: [SPEC-001]
business_rules: []
screens: []
adrs: [ADR-0001, ADR-0068, ADR-0069, ADR-0050, ADR-0203]
visual: demo
---

# SPEC-003 — Outillage SDD exécutable et intégré

## 1. Objectif

Rendre la boucle SDD du dépôt exécutable depuis les scripts du monorepo, testée contre un référentiel temporaire et consultable dans l'application. La source de vérité reste `progress/state.json` ; la page et `progress/PROGRESS.md` sont des projections de cet état.

## 2. Contexte

Les commandes `tools/sdd/*.mjs` existent avant le monorepo. SPEC-001 livre Node, pnpm, Vitest, Playwright et la route de démonstration ; cette spécification intègre les commandes sans modifier le cycle de vie défini dans `docs/engineering/sdd-process.md` §1–§3. Lire `tools/sdd/lib.mjs`, `next.mjs`, `start.mjs`, `validate.mjs`, `complete.mjs`, `fail.mjs`, `checkpoint.mjs`, `status.mjs`, `audit.mjs`, `adr.mjs`, `evidence.mjs`, `specs/catalog.json`, `progress/state.json`, ADR-0001, ADR-0068, ADR-0069 et ADR-0050. Le tableau de bord n'autorise aucune mutation depuis le navigateur.

## 3. Dépendances

- **SPEC-001** : scripts racine, projets Vitest `unit` et `integration`, page `/_dev/sdd/[specId]`, `DemoShell`, route de santé et tests Playwright avec vidéo.
- **Système** : Node.js 24, Git local. Les commandes lisant le dépôt doivent fonctionner sans remote ; une opération Git impossible échoue avec un message explicite et ne marque aucune spécification `done`.
- **Données** : catalogue de 132 entrées, état de progression et checkpoints du dépôt. En test, les mutations portent exclusivement sur une copie temporaire de ces fichiers ; aucun test ne doit modifier le suivi réel.

## 4. Règles métier couvertes

Aucune règle `BR-*` produit. Cette spécification met en œuvre le protocole transversal SDD des ADR-0001, ADR-0068 et ADR-0069.

## 5. Exigences fonctionnelles

- **EF-1** — `package.json` expose `sdd:next`, `sdd:status`, `sdd:start`, `sdd:validate`, `sdd:complete`, `sdd:fail`, `sdd:checkpoint`, `sdd:audit` et `sdd:adr`. Les arguments transmis après `pnpm <script>` arrivent sans perte dans la commande Node correspondante. Chaque script appelle le fichier `tools/sdd/<nom>.mjs` du dépôt ; aucun état parallèle n'est créé.
- **EF-2** — `sdd:next` affiche `REPRENDRE` pour la spécification `in_progress` avant d'en proposer une autre ; sinon `DÉMARRER` pour une spécification dont toutes les dépendances sont `done` et dont le checkpoint précédent est réussi ; sinon `CHECKPOINT` quand toutes les spécifications de la phase sont `done` ; sinon `TERMINÉ` seulement après CP-9. L'option `--json` renvoie les champs de `next.mjs` utilisables par un outil.
- **EF-3** — `sdd:start SPEC-xxx` vérifie l'identifiant, les dépendances, le verrou et la présence du fichier avant toute mutation ; crée ou reprend la branche prescrite et inscrit `in_progress`. Une deuxième spécification ne peut pas être lancée sous un verrou actif.
- **EF-4** — `sdd:status` régénère `progress/PROGRESS.md` à partir de `state.json` et du catalogue : synthèse, phases, checkpoints, validation par spécification, action suivante. Deux exécutions sur un même état, avec la même horloge injectable de l'outillage, produisent le même contenu hors horodatage explicite.
- **EF-5** — `sdd:validate SPEC-xxx` exige le statut `in_progress`, lance lint, typecheck, build, unitaires `[SPEC-xxx]`, intégration `[SPEC-xxx]`, e2e `@SPEC-xxx` avec vidéo, test `@visual` et acceptation ; enregistre séparément chaque résultat et ne déclare jamais un échec réussi. `sdd:complete` refuse l'absence d'une validation obligatoire, d'un critère accepté ou d'une preuve demandée.
- **EF-6** — `sdd:fail SPEC-xxx "raison"` conserve la raison et le nombre de tentatives ; au cinquième échec la spécification devient `blocked`. `--external` consigne la dépendance externe dans `progress/blockers.md` et permet de poursuivre les travaux indépendants. Les dépendants sont affichés `dependency_blocked`, sans réécrire leur statut stocké.
- **EF-7** — `sdd:audit` contrôle le catalogue, les dépendances sans cycle, les références BR/ADR/écrans, les 15 sections, les critères et leurs étiquettes de tests. Il sort avec code 1 si une erreur existe ; `--write` est la seule option qui écrit `progress/audit.md`.
- **EF-8** — `/_dev/sdd` présente la progression globale, V1, les phases P0–P9, la prochaine action et la liste des spécifications (identifiant, titre, phase, statut, dépendances, validations). Une entrée mène à sa page de démonstration uniquement si celle-ci est enregistrée. La page est accessible avec `ENABLE_SDD_PAGES=true` hors production et renvoie 404 sinon.

## 6. Exigences techniques

- **ET-1** — Les scripts pnpm sont des alias de `node tools/sdd/*.mjs` : la logique de statut, de sélection et de preuve reste dans `tools/sdd/lib.mjs` et les commandes existantes. Ne pas ajouter de second format d'état ni dériver `done` de la présence d'un fichier.
- **ET-2** — Extraire du code de `lib.mjs`, si nécessaire, les fonctions pures d'évaluation des dépendances, du prochain travail et du rendu du tableau de bord ; injecter la racine de travail et l'horloge dans les fonctions qui lisent ou écrivent. Les CLI conservent leurs signatures actuelles ; leurs fichiers ne font que charger le contexte, appeler les fonctions et fixer le code de sortie.
- **ET-3** — Les écritures de `state.json`, du verrou et des rapports utilisent un fichier temporaire dans le même répertoire puis un renommage atomique. Ne jamais écrire un `done` avant que les preuves et la fusion soient réussies. Une erreur est journalisée dans `lastError` sans supprimer les validations antérieures réussies si elles restent valides.
- **ET-4** — Le serveur lit `catalog.json` et `state.json` avec un module serveur `apps/web/lib/sdd-status.ts` ; il réutilise `displayStatus` et `nextAction`, sérialise seulement les champs publics, et ne fournit aucune route de mutation. La page porte `dynamic = 'force-dynamic'` et `Cache-Control: no-store` si un handler sert les données.
- **ET-5** — Les tests d'intégration lancent les commandes dans un répertoire temporaire contenant catalogue, état, fichiers de spécification et dépôt Git initiaux. Un chemin vers `ROOT` peut être injecté par un argument ou une variable réservée aux tests, jamais par une constante modifiée pendant le test.
- **ET-6** — Les noms d'état exposés par l'UI sont `pending`, `ready`, `waiting`, `in_progress`, `done`, `blocked`, `dependency_blocked` ; l'UI traduit ces noms en français et affiche un texte de statut en plus de la couleur.

## 7. Comportements attendus et cas limites

- **CL-1** — ID absent ou inconnu : code non nul et erreur claire, sans écriture dans `state.json`.
- **CL-2** — Catalogue avec cycle de dépendances : audit en échec, avec la chaîne du cycle ; `next` ne sélectionne aucun membre du cycle.
- **CL-3** — Verrou sur SPEC-A et démarrage de SPEC-B : refus, verrou et état inchangés ; reprise de SPEC-A permise.
- **CL-4** — Une validation e2e réussit sans pièce jointe vidéo ou sans `@visual` : validations `e2e` ou `visual` en échec et `complete` refuse.
- **CL-5** — Processus interrompu après `start` : `next` rend `REPRENDRE` avec la même spécification et la branche existante.
- **CL-6** — Dépendance bloquée : le dépendant reste `pending` dans le JSON et s'affiche `dependency_blocked` ; une autre branche indépendante demeure sélectionnable.
- **CL-7** — `ENABLE_SDD_PAGES` absent ou `APP_ENV=production` : les pages SDD, y compris l'index, répondent 404 sans exposer le contenu du catalogue.
- **CL-8** — `state.json` mal formé : message d'erreur contrôlé ; ne pas le recréer silencieusement ni réinitialiser une progression existante.

## 8. Instructions d'implémentation

1. Ajouter les neuf alias `sdd:*` à `package.json` et exécuter `pnpm sdd:next --json`, `pnpm sdd:status`, `pnpm sdd:audit` pour vérifier la transmission des arguments. Commit `build(SPEC-003): expose les commandes SDD dans pnpm`.
2. Isoler les opérations testables de `lib.mjs` sans changer les formats du catalogue ou de l'état. Introduire la racine et l'horloge injectables, puis sécuriser les écritures atomiques. Commit `refactor(SPEC-003): rend la boucle SDD testable`.
3. Créer `apps/web/lib/sdd-status.ts` et `apps/web/app/%5Fdev/sdd/page.tsx` ; ajouter les messages français. La page vérifie `sddPagesEnabled()` avant toute lecture des fichiers. Commit `feat(SPEC-003): affiche l'état du référentiel`.
4. Écrire les tests de la section 12 sur des données temporaires, puis les scénarios navigateur. Commit `test(SPEC-003): vérifie la sélection la reprise et l'audit`.
5. Exécuter la validation de la spécification, renseigner les preuves observées dans `acceptance.md`, puis terminer avec la boucle SDD. Aucun test ne modifie `progress/state.json` réel.

## 9. Fichiers et composants concernés

- **Créés** : `apps/web/lib/sdd-status.ts`, `apps/web/app/%5Fdev/sdd/page.tsx`, `tools/sdd/test/unit/next.test.ts`, `tools/sdd/test/unit/audit.test.ts`, `tools/sdd/test/integration/cli.test.ts`, `apps/web/e2e/specs/p0/spec-003.spec.ts`.
- **Modifiés** : `package.json` (alias), `tools/sdd/lib.mjs` et les CLI strictement nécessaires à l'injection/écriture atomique, `apps/web/messages/fr.ts`, `apps/web/app/page.tsx` (lien déjà prévu par SPEC-001), `progress/PROGRESS.md` (généré, jamais édité à la main).
- **Lus / réutilisés** : `specs/catalog.json`, `progress/state.json`, `tools/sdd/*.mjs`, `apps/web/lib/sdd-pages.ts`, `apps/web/components/sdd/demo-shell.tsx`.

## 10. Interface et conformité visuelle

Mode `demo`, page `/_dev/sdd` dans la coquille de démonstration. L'ordre est : `h1` « Progression SDD », indicateurs « Spécifications », « Terminées », « En cours », « Bloquées », barre d'avancement, bloc « Prochaine action », tableau « Phases », tableau « Spécifications ». Les tableaux ont des en-têtes de colonne explicites ; le statut est annoncé en texte et `aria-live="polite"` après actualisation. Une ligne bloquée affiche la raison disponible, jamais un secret ni le contenu du journal. L'état sans spécification affiche « Aucune spécification dans le catalogue. » ; un fichier d'état illisible affiche un message d'erreur et un identifiant de requête.

À 390 px, les indicateurs passent sur une colonne et les tableaux défilent horizontalement dans une région nommée, sans tronquer les titres. Vérifier les jetons via `expectTokens`, la présence et l'ordre des régions, puis `toHaveScreenshot('sdd-status.png', { maxDiffPixelRatio: 0.01 })`. Aucun écran métier maquetté n'est modifié.

## 11. Critères d'acceptation

- **CA-1** — Les neuf alias pnpm appellent le bon fichier et transmettent les arguments ; `sdd:next --json` renvoie une action valide du schéma existant.
- **CA-2** — Un état avec une spécification `in_progress` renvoie `REPRENDRE` ; un état avec cinq échecs renvoie `blocked` ; un dépendant bloqué est affiché `dependency_blocked` sans mutation de son état stocké.
- **CA-3** — L'audit détecte un cycle, un fichier manquant et une section absente, sort avec code 1 et n'écrit aucun rapport sans `--write`.
- **CA-4** — L'index `/_dev/sdd` affiche les nombres calculés du catalogue et de l'état, et répond 404 lorsque les pages SDD sont désactivées ou en production.
- **CA-5** — `complete` refuse un jeu de validations auquel manque une vidéo, un test `@visual` ou un critère accepté ; l'état reste non terminé.

## 12. Plan de tests

- **Unitaires** — `tools/sdd/test/unit/next.test.ts`, `describe('[SPEC-003] next action')` : état initial → SPEC-001 ; en cours → reprise ; dépendances terminées → prochaine prête ; phase terminée → checkpoint ; CP-9 terminé → fin (CA-2). `tools/sdd/test/unit/audit.test.ts`, `describe('[SPEC-003] audit')` : cycle, fichier absent, section absente, code d'erreur et rapport absent sans `--write` (CA-3).
- **Intégration** — `tools/sdd/test/integration/cli.test.ts`, `describe('[SPEC-003] CLI')` : invoquer les neuf scripts sur un référentiel temporaire ; vérifier arguments, verrou, reprise, cinquième échec, génération de `PROGRESS.md`, refus de `complete` incomplet et absence de mutation du dépôt réel (CA-1, CA-2, CA-5).
- **End-to-end** — `apps/web/e2e/specs/p0/spec-003.spec.ts`, `test('consulte la progression SDD @SPEC-003')` : ouvrir l'index avec pages activées, vérifier les totaux, la prochaine action et le lien vers SPEC-001 ; ouvrir le lien, revenir. La vidéo est conservée. `test('masque les pages SDD @SPEC-003')` vérifie la 404 en configuration désactivée (CA-4).
- **Visuel** — `test('index SDD conforme @SPEC-003 @visual')` : ordre des régions, jetons, capture desktop et mobile, seuil de non-régression 1 % (CA-4).
- **Non-régression** — `[SPEC-001]`, `@SPEC-001` et les tests des hooks `[SPEC-002]` si SPEC-002 est déjà terminée.

| Critère | Tests |
|---|---|
| CA-1 | intégration CLI |
| CA-2 | unitaires next action ; intégration CLI |
| CA-3 | unitaires audit |
| CA-4 | e2e index et masquage ; `@visual` |
| CA-5 | intégration CLI |

## 13. Preuves attendues

`evidence/SPEC-003/` contient les rapports unitaires et d'intégration, le JSON et le JUnit Playwright, une vidéo de consultation, les captures desktop/mobile, `checks.json`, et `acceptance.md` avec un lien de preuve pour chaque CA. Conserver une sortie anonymisée de `sdd:next --json` et du test de refus de `complete` dans le résumé ; ne pas fabriquer de validation réussie.

## 14. Définition de terminé

Toutes les conditions de `docs/engineering/testing.md` §7 sont satisfaites. Les commandes pnpm et les commandes Node restent équivalentes ; les tests n'ont pas modifié le vrai `progress/state.json` ; la page SDD est inaccessible en production ; l'audit du référentiel complet peut encore signaler les autres fichiers de spécification non rédigés, ce qui ne doit jamais être présenté comme une validation de cette spécification.

## 15. Décisions et hypothèses

ADR-0001 fixe la boucle, ADR-0068 la source de vérité, ADR-0069 la reprise et les checkpoints, ADR-0050 le stockage des vidéos. ADR-0203 répartit la responsabilité de l'index avec SPEC-006 selon l'ordre de réalisation. La page lit un instantané de l'état au chargement ; toute actualisation volontaire recharge la page, sans canal temps réel.
