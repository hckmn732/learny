# Matrice des parcours V1 (SPEC-807)

Cette matrice relie chaque étape des six parcours de bout en bout de la V1 (SPEC-807 EF-1 à EF-6) à la route réelle de l'application, à la spécification propriétaire (`specs/catalog.json`), aux règles métier (`docs/product/business-rules.md`), aux données de test et au fichier Playwright qui la rejoue. La section EF-7 liste les états d'écran rejoués par la régression visuelle.

`pnpm quality:journeys` (`tools/quality/check-v1-journeys.mjs`) valide ce document : identifiant d'étape unique, route existante dans `apps/web/app`, spécification V1 du catalogue, règles métier V1 du catalogue et rattachées à la spécification propriétaire, fixtures et fichiers de test existants, preuves limitées à des liens vers `evidence/SPEC-807/`. Toute erreur rend un code de sortie non nul. `--require-evidence` exige en plus que chaque rapport lié existe (clôture CP-8).

## Conventions

- **Route** : chemin de page ou d'API tel qu'exposé par `apps/web/app` (groupes `(app)`, `(auth)`, `(exam)` omis) ; les segments dynamiques gardent leur nom entre crochets (`[fid]`, `[mid]`…). Une route d'API peut être précédée de sa méthode HTTP, contrôlée dans `route.ts`.
- **Spécification** : une seule spécification propriétaire par étape ; elle porte la règle métier dans le catalogue ou dans son texte.
- **Fixture** : fabriques SPEC-115 (`packages/testing/src/factories`), transport e-mail mémoire, horloge injectable et fixtures IA versionnées (`packages/llm/fixtures`, choisies par scénario). Chaque parcours crée ses propres utilisateurs et identifiants (ET-2) ; l'horloge démarre à `2026-11-11T12:20:00Z` (ET-1).
- **Preuves** : liens vers les rapports produits par `pnpm test:v1:journeys` (JSON, JUnit, vidéos par moteur) puis copiés dans `evidence/SPEC-807/`. Aucune case n'est cochée d'avance : le statut d'une étape se lit dans le rapport, jamais dans ce document.

Commande de référence : `PLAYWRIGHT_JSON_OUTPUT_FILE=evidence/SPEC-807/journeys.json PLAYWRIGHT_JUNIT_OUTPUT_FILE=evidence/SPEC-807/journeys.xml pnpm test:v1:journeys` (projets `journeys`, `journeys-firefox`, `journeys-webkit`).

## EF-1 — Première formation

- Fichier de test : `apps/web/e2e/journeys/first-formation.spec.ts`
- Test : `première formation de l'inscription au module ouvert @SPEC-807`
- Preuves : [rapport JSON](../../evidence/SPEC-807/journeys.json) · [rapport JUnit](../../evidence/SPEC-807/journeys.xml) · [vidéos](../../evidence/SPEC-807/video/)

| Étape | Action | Route | Spécification | Règles métier | Fixture | Test |
|---|---|---|---|---|---|---|
| J1.01 | Ouvre l'inscription, case de consentement non pré-cochée, accepte les versions légales en vigueur | `/inscription` | SPEC-806 | BR-ACC-02, BR-PLA-05 | `packages/testing/src/factories/helpers.ts` | `apps/web/e2e/journeys/first-formation.spec.ts` |
| J1.02 | S'inscrit avec une adresse unique | `/inscription`, `POST /api/v1/auth/sign-up` | SPEC-601 | BR-ACC-01 | `packages/testing/src/factories/helpers.ts` | `apps/web/e2e/journeys/first-formation.spec.ts` |
| J1.03 | Vérifie son e-mail par le lien reçu dans le transport mémoire | `/verifier-email`, `GET /api/v1/auth/callback` | SPEC-601 | BR-ACC-03 | `packages/testing/src/mail.ts`, `packages/testing/src/auth.ts` | `apps/web/e2e/journeys/first-formation.spec.ts` |
| J1.04 | Renseigne l'étape Profil des premiers pas | `/premiers-pas/profil` | SPEC-602 | BR-ACC-04, BR-ACC-05 | `packages/testing/src/clock.ts` | `apps/web/e2e/journeys/first-formation.spec.ts` |
| J1.05 | Règle l'étape Rythme | `/premiers-pas/rythme` | SPEC-602 | BR-ACC-08 | `packages/testing/src/clock.ts` | `apps/web/e2e/journeys/first-formation.spec.ts` |
| J1.06 | Franchit l'étape IA, puis l'application devient accessible | `/premiers-pas/ia` | SPEC-602 | BR-ACC-04 | `packages/testing/src/env.ts` | `apps/web/e2e/journeys/first-formation.spec.ts` |
| J1.07 | Règle l'étape Rappels | `/premiers-pas/rappels`, `POST /api/v1/me/push-subscriptions` | SPEC-602 | BR-ACC-04, BR-ACC-07 | `packages/testing/src/env.ts` | `apps/web/e2e/journeys/first-formation.spec.ts` |
| J1.08 | Termine l'étape Départ | `/premiers-pas/depart`, `/accueil` | SPEC-602 | BR-ACC-04 | `packages/testing/src/clock.ts` | `apps/web/e2e/journeys/first-formation.spec.ts` |
| J1.09 | Crée une formation en saisissant ce qu'il veut apprendre | `/formations/nouvelle`, `POST /api/v1/formations` | SPEC-604 | BR-FOR-01 | `packages/llm/fixtures/tutor/cadrage-sap-q1.json` | `apps/web/e2e/journeys/first-formation.spec.ts` |
| J1.10 | Répond aux questions du cadrage et suit le profil de la formation | `/formations/[fid]/cadrage`, `POST /api/v1/formations/[fid]/cadrage/messages` | SPEC-604 | BR-FOR-01, BR-FOR-02 | `packages/llm/fixtures/tutor/cadrage-sap-q2.json`, `packages/llm/fixtures/tutor/cadrage-sap-done.json` | `apps/web/e2e/journeys/first-formation.spec.ts` |
| J1.11 | Génère puis valide le programme proposé | `/formations/[fid]/programme`, `POST /api/v1/formations/[fid]/programme/validate` | SPEC-605 | BR-FOR-04, BR-FOR-05 | `packages/llm/fixtures/programme/programme-sap.json` | `apps/web/e2e/journeys/first-formation.spec.ts` |
| J1.12 | Voit le premier module ouvert et les suivants verrouillés avec leur condition | `/formations/[fid]/programme` | SPEC-606 | BR-FOR-07, BR-FOR-08 | `packages/llm/fixtures/programme/programme-sap.json` | `apps/web/e2e/journeys/first-formation.spec.ts` |

## EF-2 — Apprentissage et remédiation

- Fichier de test : `apps/web/e2e/journeys/first-formation.spec.ts`
- Test : `apprentissage sourcé, quiz échoué puis réussi @SPEC-807`
- Preuves : [rapport JSON](../../evidence/SPEC-807/journeys.json) · [rapport JUnit](../../evidence/SPEC-807/journeys.xml) · [vidéos](../../evidence/SPEC-807/video/)

| Étape | Action | Route | Spécification | Règles métier | Fixture | Test |
|---|---|---|---|---|---|---|
| J2.01 | Ajoute une note au premier chapitre | `/formations/[fid]/modules/[mid]`, `POST /api/v1/chapters/[cid]/resources` | SPEC-607 | BR-APP-01 | `packages/testing/src/factories/resource.ts` | `apps/web/e2e/journeys/first-formation.spec.ts` |
| J2.02 | Dépose un PDF de test dans les limites d'import | `/formations/[fid]/modules/[mid]`, `POST /api/v1/chapters/[cid]/uploads` | SPEC-607 | BR-APP-01, BR-APP-02 | `packages/testing/src/factories/resource.ts` | `apps/web/e2e/journeys/first-formation.spec.ts` |
| J2.03 | Attend que la note et le PDF soient prêts (passages repérés) | `/formations/[fid]/modules/[mid]`, `POST /api/v1/resources/[rid]/finalize` | SPEC-509 | BR-APP-06, BR-APP-07 | `packages/testing/src/factories/resource.ts` | `apps/web/e2e/journeys/first-formation.spec.ts` |
| J2.04 | Déclare le chapitre terminé et génère un cours sourcé | `POST /api/v1/chapters/[cid]/complete`, `POST /api/v1/modules/[mid]/course-generation` | SPEC-608 | BR-COU-01, BR-COU-02 | `packages/llm/fixtures/course/course-sourced.json` | `apps/web/e2e/journeys/first-formation.spec.ts` |
| J2.05 | Lit un chapitre ; chaque citation pointe vers un passage réellement déposé | `/formations/[fid]/modules/[mid]/cours`, `GET /api/v1/course-citations/[cid]/source` | SPEC-609 | BR-COU-02, BR-COU-08, BR-COU-11 | `packages/llm/fixtures/course/course-sourced.json` | `apps/web/e2e/journeys/first-formation.spec.ts` |
| J2.06 | Pose une question au tuteur simulé depuis le cours | `/formations/[fid]/modules/[mid]/cours`, `POST /api/v1/conversations/[id]/messages` | SPEC-610 | BR-TUT-01, BR-TUT-03 | `packages/llm/fixtures/tutor/chat-generic.json` | `apps/web/e2e/journeys/first-formation.spec.ts` |
| J2.07 | Rend un résumé de fin de chapitre corrigé par le tuteur | `POST /api/v1/chapters/[cid]/summary` | SPEC-609 | BR-COU-07 | `packages/llm/fixtures/light/course-summary.json` | `apps/web/e2e/journeys/first-formation.spec.ts` |
| J2.08 | Passe le quiz de validation et termine sous le seuil | `/formations/[fid]/modules/[mid]/quiz`, `POST /api/v1/attempts/[aid]/submit` | SPEC-611 | BR-QUI-01, BR-QUI-04 | `packages/llm/fixtures/tutor/question-bank.json` | `apps/web/e2e/journeys/first-formation.spec.ts` |
| J2.09 | Voit le résultat en échec, les lacunes qualifiées et la remédiation proposée | `/formations/[fid]/modules/[mid]/quiz/[attemptId]/resultat`, `/formations/[fid]/modules/[mid]/remediation` | SPEC-612 | BR-QUI-06, BR-QUI-08, BR-LAC-04 | `packages/llm/fixtures/gaps/remediation-plan-sap-m3.json` | `apps/web/e2e/journeys/first-formation.spec.ts` |
| J2.10 | Repasse le quiz après la condition de délai de la remédiation | `POST /api/v1/modules/[mid]/remediation/complete`, `POST /api/v1/modules/[mid]/quiz/attempts` | SPEC-715 | BR-AUT-04, BR-QUI-02 | `packages/testing/src/clock.ts` | `apps/web/e2e/journeys/first-formation.spec.ts` |
| J2.11 | Réussit le quiz et voit le module suivant ouvert | `/formations/[fid]/modules/[mid]/quiz/[attemptId]/resultat`, `/formations/[fid]/programme` | SPEC-612 | BR-QUI-05, BR-FOR-07 | `packages/llm/fixtures/tutor/question-bank.json` | `apps/web/e2e/journeys/first-formation.spec.ts` |

## EF-3 — Révisions, hors ligne et automatismes

- Fichier de test : `apps/web/e2e/journeys/review-automations.spec.ts`
- Test : `révisions dues, synchronisation hors ligne et automatismes @SPEC-807`
- Preuves : [rapport JSON](../../evidence/SPEC-807/journeys.json) · [rapport JUnit](../../evidence/SPEC-807/journeys.xml) · [vidéos](../../evidence/SPEC-807/video/)

| Étape | Action | Route | Spécification | Règles métier | Fixture | Test |
|---|---|---|---|---|---|---|
| J3.01 | Avec l'horloge avancée par la fixture, voit les notions dues dans le quiz global du jour | `/formations/[fid]/quiz-global`, `GET /api/v1/formations/[fid]/global-quiz/today` | SPEC-701 | BR-MEM-03, BR-MEM-08 | `packages/testing/src/clock.ts`, `packages/testing/src/factories/notion-state.ts` | `apps/web/e2e/journeys/review-automations.spec.ts` |
| J3.02 | Répond à une carte : FSRS et maîtrise sont mis à jour | `POST /api/v1/review-sessions/[sid]/answers` | SPEC-701 | BR-MEM-02, BR-MEM-10 | `packages/testing/src/factories/global-quiz.ts` | `apps/web/e2e/journeys/review-automations.spec.ts` |
| J3.03 | Voit la série et la régularité mises à jour | `/accueil`, `GET /api/v1/streak` | SPEC-723 | BR-GAM-02 | `packages/testing/src/clock.ts` | `apps/web/e2e/journeys/review-automations.spec.ts` |
| J3.04 | Retrouve la révision dans l'agenda | `/agenda`, `GET /api/v1/agenda` | SPEC-704 | BR-AGE-01, BR-AGE-02 | `packages/testing/src/factories/schedule-slot.ts` | `apps/web/e2e/journeys/review-automations.spec.ts` |
| J3.05 | Répond hors ligne : la réponse est stockée dans la file locale | `/hors-ligne/revisions`, `GET /api/v1/offline/pack` | SPEC-801 | BR-PLA-01 | `packages/testing/src/factories/global-quiz.ts` | `apps/web/e2e/journeys/review-automations.spec.ts` |
| J3.06 | Se reconnecte : la réponse est synchronisée une seule fois, FSRS et série ne doublent pas | `POST /api/v1/sync/offline-answers` | SPEC-801 | BR-PLA-01, BR-GAM-01 | `packages/testing/src/factories/global-quiz.ts` | `apps/web/e2e/journeys/review-automations.spec.ts` |
| J3.07 | Configure les automatismes dans les paramètres | `/parametres`, `PATCH /api/v1/me/automations` | SPEC-710 | BR-SET-04 | `packages/testing/src/factories/user.ts` | `apps/web/e2e/journeys/review-automations.spec.ts` |
| J3.08 | Voit les actions produites et le journal de la semaine | `/accueil`, `GET /api/v1/me/automation-actions` | SPEC-711 | BR-AUT-12 | `packages/testing/src/clock.ts` | `apps/web/e2e/journeys/review-automations.spec.ts` |
| J3.09 | Vérifie les garde-fous : accord demandé, plafond de notifications et durée respectés | `/accueil`, `POST /api/v1/me/automation-actions/[id]/accept` | SPEC-711 | BR-AUT-11 | `packages/testing/src/factories/notification.ts` | `apps/web/e2e/journeys/review-automations.spec.ts` |
| J3.10 | Voit le quiz global plafonné en durée | `/formations/[fid]/quiz-global` | SPEC-718 | BR-AUT-07 | `packages/testing/src/factories/notion-state.ts` | `apps/web/e2e/journeys/review-automations.spec.ts` |
| J3.11 | Voit la carte « Le tuteur a agi pour vous » sur l'accueil final | `/accueil` | SPEC-722 | BR-AUT-13 | `packages/testing/src/clock.ts` | `apps/web/e2e/journeys/review-automations.spec.ts` |

## EF-4 — Formation à plusieurs

- Fichier de test : `apps/web/e2e/journeys/group.spec.ts`
- Test : `groupe à deux comptes et apports privés @SPEC-807`
- Preuves : [rapport JSON](../../evidence/SPEC-807/journeys.json) · [rapport JUnit](../../evidence/SPEC-807/journeys.xml) · [vidéos](../../evidence/SPEC-807/video/)

| Étape | Action | Route | Spécification | Règles métier | Fixture | Test |
|---|---|---|---|---|---|---|
| J4.01 | Le propriétaire transforme sa formation active en formation à plusieurs et obtient un code | `/formations/[fid]/groupe`, `POST /api/v1/formations/[fid]/group` | SPEC-724 | BR-GRP-01 | `packages/testing/src/factories/user.ts`, `packages/testing/src/factories/formation.ts` | `apps/web/e2e/journeys/group.spec.ts` |
| J4.02 | Le second compte rejoint par le code d'invitation | `/invitation/[code]`, `POST /api/v1/invitations/[code]/accept` | SPEC-724 | BR-GRP-02 | `packages/testing/src/factories/user.ts` | `apps/web/e2e/journeys/group.spec.ts` |
| J4.03 | L'invité voit le programme partagé et sa progression propre | `/formations/[fid]/programme`, `/formations/[fid]/groupe` | SPEC-724 | BR-GRP-03, BR-GRP-04 | `packages/testing/src/factories/group.ts` | `apps/web/e2e/journeys/group.spec.ts` |
| J4.04 | Chacun dépose un apport privé dans un chapitre partagé | `/formations/[fid]/modules/[mid]`, `POST /api/v1/chapters/[cid]/resources` | SPEC-724 | BR-APP-03, BR-GRP-04 | `packages/testing/src/factories/resource.ts` | `apps/web/e2e/journeys/group.spec.ts` |
| J4.05 | L'autre membre ne peut ni lire ni télécharger cet apport (403/404, aucune URL signée) | `/formations/[fid]/modules/[mid]`, `GET /api/v1/resources/[rid]/url` | SPEC-113 | BR-APP-03 | `packages/testing/src/factories/resource.ts` | `apps/web/e2e/journeys/group.spec.ts` |
| J4.06 | L'invité quitte le groupe et conserve une copie individuelle | `POST /api/v1/groups/[gid]/leave`, `/formations/[fid]/programme` | SPEC-724 | BR-GRP-05 | `packages/testing/src/factories/group.ts` | `apps/web/e2e/journeys/group.spec.ts` |

## EF-5 — Examen blanc

- Fichier de test : `apps/web/e2e/journeys/mock-exam.spec.ts`
- Test : `examen blanc interrompu puis repris sans gain de temps @SPEC-807`
- Preuves : [rapport JSON](../../evidence/SPEC-807/journeys.json) · [rapport JUnit](../../evidence/SPEC-807/journeys.xml) · [vidéos](../../evidence/SPEC-807/video/)

| Étape | Action | Route | Spécification | Règles métier | Fixture | Test |
|---|---|---|---|---|---|---|
| J5.01 | Confirme le format de l'examen blanc | `/formations/[fid]/examen-blanc`, `POST /api/v1/formations/[fid]/mock-exams/format` | SPEC-614 | BR-PRA-02 | `packages/testing/src/factories/formation.ts` | `apps/web/e2e/journeys/mock-exam.spec.ts` |
| J5.02 | Démarre l'épreuve sans aide (menu, tuteur et cours masqués) | `POST /api/v1/formations/[fid]/mock-exams/attempts`, `/formations/[fid]/examen-blanc/[attemptId]` | SPEC-614 | BR-PRA-03 | `packages/testing/src/factories/attempt.ts` | `apps/web/e2e/journeys/mock-exam.spec.ts` |
| J5.03 | Répond aux questions et en marque une « à revoir » | `PUT /api/v1/mock-exams/[aid]/answers/[pos]`, `PUT /api/v1/mock-exams/[aid]/marks/[pos]` | SPEC-614 | BR-PRA-03 | `packages/testing/src/factories/brick.ts` | `apps/web/e2e/journeys/mock-exam.spec.ts` |
| J5.04 | Interrompt puis reprend : la minuterie serveur ne rend aucun temps | `GET /api/v1/mock-exams/[aid]`, `/formations/[fid]/examen-blanc/[attemptId]` | SPEC-614 | BR-PRA-03 | `packages/testing/src/clock.ts` | `apps/web/e2e/journeys/mock-exam.spec.ts` |
| J5.05 | Soumet après confirmation | `POST /api/v1/mock-exams/[aid]/submit` | SPEC-614 | BR-PRA-03 | `packages/testing/src/clock.ts` | `apps/web/e2e/journeys/mock-exam.spec.ts` |
| J5.06 | Voit le résultat diagnostique relié aux lacunes et au planning | `GET /api/v1/mock-exams/[aid]/result`, `/formations/[fid]/lacunes` | SPEC-614 | BR-PRA-04 | `packages/testing/src/factories/notion-state.ts` | `apps/web/e2e/journeys/mock-exam.spec.ts` |

## EF-6 — Données personnelles

- Fichier de test : `apps/web/e2e/journeys/data-rights.spec.ts`
- Test : `export puis suppression du compte à J+30 @SPEC-807`
- Preuves : [rapport JSON](../../evidence/SPEC-807/journeys.json) · [rapport JUnit](../../evidence/SPEC-807/journeys.xml) · [vidéos](../../evidence/SPEC-807/video/)

| Étape | Action | Route | Spécification | Règles métier | Fixture | Test |
|---|---|---|---|---|---|---|
| J6.01 | Demande un export de ses données depuis les paramètres | `/parametres`, `POST /api/v1/me/export` | SPEC-211 | BR-ACC-10 | `packages/testing/src/factories/user.ts` | `apps/web/e2e/journeys/data-rights.spec.ts` |
| J6.02 | Reçoit l'e-mail d'export dans le transport mémoire | `GET /api/v1/me/exports/[id]` | SPEC-211 | BR-NOT-02 | `packages/testing/src/mail.ts` | `apps/web/e2e/journeys/data-rights.spec.ts` |
| J6.03 | Télécharge l'archive : cours, apports, résultats et réglages, aucune donnée d'un autre compte | `GET /api/v1/me/exports/[id]` | SPEC-211 | BR-ACC-10, BR-PLA-05 | `packages/testing/src/factories/course.ts`, `packages/testing/src/factories/resource.ts` | `apps/web/e2e/journeys/data-rights.spec.ts` |
| J6.04 | Demande la suppression du compte | `/parametres`, `POST /api/v1/me/deletion` | SPEC-211 | BR-ACC-11 | `packages/testing/src/mail.ts` | `apps/web/e2e/journeys/data-rights.spec.ts` |
| J6.05 | Annule la suppression avant J+30 | `DELETE /api/v1/me/deletion` | SPEC-211 | BR-ACC-11 | `packages/testing/src/clock.ts` | `apps/web/e2e/journeys/data-rights.spec.ts` |
| J6.06 | Redemande la suppression ; après avancement contrôlé de l'horloge, les données sont effacées | `POST /api/v1/me/deletion`, `/connexion` | SPEC-211 | BR-ACC-11, BR-PLA-05 | `packages/testing/src/clock.ts` | `apps/web/e2e/journeys/data-rights.spec.ts` |

## EF-7 — Régression visuelle des écrans V1

- Fichier de test : `apps/web/e2e/journeys/visual-regression.spec.ts`
- Test : `régression des écrans V1 @SPEC-807 @visual`
- Preuves : [ratios maquette](../../evidence/SPEC-807/visual/ratios.json) · [captures et diffs](../../evidence/SPEC-807/visual/)

Données : jeu de démonstration SPEC-115 (Alex Perrin, `restoreDemoData`) à l'heure de référence. Comparaison maquette ≤ 12 % pleine fenêtre ou par régions (ADR-0034, ADR-0161), ligne de base `toHaveScreenshot` ≤ 1 %, jetons, structure et axe sur desktop et mobile (390 × 844).

| Écran | État capturé | Route | Spécification | Référence | Test |
|---|---|---|---|---|---|
| SCR-01 | Inscription avec consentement coché | `/inscription` | SPEC-601 | `design/references/SCR-01-base-desktop.png` | `apps/web/e2e/journeys/visual-regression.spec.ts` |
| SCR-03 | Accueil final après automatismes (pleine page et régions) | `/accueil` | SPEC-722 | `design/references/SCR-03-base-desktop.png` | `apps/web/e2e/journeys/visual-regression.spec.ts` |
| SCR-07 | Cours avec source ouverte | `/formations/[fid]/modules/[mid]/cours` | SPEC-609 | `design/references/SCR-07-base-desktop.png` | `apps/web/e2e/journeys/visual-regression.spec.ts` |
| SCR-09 | Résultat de quiz échoué puis réussi | `/formations/[fid]/modules/[mid]/quiz/[attemptId]/resultat` | SPEC-612 | `design/references/SCR-09-base-desktop.png` | `apps/web/e2e/journeys/visual-regression.spec.ts` |
| SCR-10 | Quiz global avec carte de rappel et raison du choix | `/formations/[fid]/quiz-global` | SPEC-701 | `design/references/SCR-10-base-desktop.png` | `apps/web/e2e/journeys/visual-regression.spec.ts` |
