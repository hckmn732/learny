---
id: SPEC-703
title: "Micro-séance"
phase: P7
priority: V1
depends_on: [SPEC-701]
business_rules: [BR-MEM-08, BR-AUT-02]
screens: [SCR-10]
adrs: [ADR-0182]
visual: mockup
---

# SPEC-703 — Micro-séance

## 1. Objectif

Activer le sélecteur « Séance complète / Micro-séance » de l'écran Quiz global et livrer la **micro-séance** : version courte (une carte de rappel et une question, durée réglée par l'automatisme 2) de la session du jour, avec sa note explicative, son rail à deux jeux, son écran de fin (« 5 notions revues en 5 minutes ») et sa prise en compte pour la série. Le déclenchement automatique à l'heure H (notification) est livré par SPEC-713.

## 2. Contexte

La micro-séance est la planche de salut des jours chargés : elle garde le rythme et la série (BR-AUT-02, BR-GAM-01). Elle réutilise intégralement l'écran, les contrats et le service de SPEC-701 avec `mode = 'micro'` (ADR-0180), et le tirage `selectGlobalQuizSession` en mode micro de SPEC-406.

Lire : `design/maquettes/QuizGlobal.dc.html` (variable `micro`, `seq = [1, 5]`, `modes`, `modeNote`, `pillNotions`, `pillDuree`, `endTitle`, `endOk`, `endSoon`), `docs/product/business-rules.md` (AUT-02, AUT-11, GAM-01, MEM-08), SPEC-701, ADR-0182, ADR-0033.

## 3. Dépendances

- **SPEC-701** : page `/formations/[fid]/quiz-global`, `GlobalQuizSession`, `SessionModeSwitch`, contrats `review.ts`, service `getOrCreateTodaySession`, `answerReviewItem`, `completeReviewSession`, API `GET /formations/:fid/global-quiz/today?mode=`.
- Via SPEC-701 : **SPEC-406** (tirage en mode `micro` : `selectGlobalQuizSession({ ..., mode: 'micro', microMinutes })`), **SPEC-411** (`applyReviewResult` avec `source: 'micro_session'`, `daily_activity`), **SPEC-409** (série), **SPEC-702** n'est pas requis : si la question choisie est d'un type de jeu livré par SPEC-702, elle est jouable dès que SPEC-702 est terminée ; sinon la question est une question à choix (rendu SPEC-503) — voir ET-3.
- Paramètres de l'automatisme 2 lus dans `automation_settings` (`key = 'micro_seance'`, `params.durationMin ∈ {3,5,10}`, défaut 5) avec les valeurs par défaut de `packages/contracts/src/automations.ts` si la ligne est absente.
- Externes : aucune ; aucun appel IA.

## 4. Règles métier couvertes

- **BR-AUT-02** — La micro-séance contient des cartes de rappel et une question (ADR-0182), dure D minutes (paramètre de l'automatisme 2 : 3, 5 ou 10, défaut 5) ; la terminer rend la journée qualifiante pour la série. Elle est accessible à tout moment depuis le sélecteur ; la proposition à l'heure H est l'objet de SPEC-713.
- **BR-MEM-08** — La micro-séance présente le même rail (statuts), la même barre de progression, la raison du choix, « Passer » et un écran de fin adapté (notions revues, réussies, à revoir plus tôt, série).

## 5. Exigences fonctionnelles

- **EF-1 — Sélecteur.** Le groupe « Durée de la séance » propose `Séance complète · {m} min` et `Micro-séance · {D} min` ; le bouton actif a `aria-pressed="true"` (fond `#111113`, texte blanc, graisse 600). Cliquer un mode remplace l'URL par `/formations/[fid]/quiz-global?mode=micro` (ou sans paramètre pour le mode complet, via `router.replace`, sans entrée d'historique) et charge la session de ce mode.
- **EF-2 — Session micro.** Le premier passage en mode micro du jour crée une activité `global_quiz_session` avec `config.mode = 'micro'` (même cycle que SPEC-701). Composition (ADR-0182) : pour D = 3 ou 5, **une carte de rappel** puis **une question** ; pour D = 10, **deux cartes de rappel** puis une question. La carte porte sur la notion la plus prioritaire (lacune d'abord, puis la plus en retard) ; la question est de préférence un format multi-notions (texte à trous, association, classement) couvrant jusqu'à 4 autres notions prioritaires, sinon une question à choix.
- **EF-3 — En-tête en mode micro.** Pastilles `{n} notions` (notions distinctes de la micro-séance), libellé des modules, `≈ {D} min`. Note : `Version courte de secours : une carte de rappel et une question. Elle garde le rythme et la série les jours chargés.` (pour D = 10 : `Version courte de secours : deux cartes de rappel et une question. Elle garde le rythme et la série les jours chargés.`), suivie du lien `Régler`.
- **EF-4 — Rail et progression.** Le rail ne contient que les items de la micro-séance, numérotés à partir de 1 ; libellé de progression `Jeu {i} sur {N}` (démonstration : `Jeu 1 sur 2`). L'encadré « Réglé par le tuteur » affiche la puce `Micro-séance : la notion la plus urgente en carte de rappel, puis une question qui en mêle plusieurs.` suivie, s'il y en a une, de la puce « Lacune en priorité » de SPEC-701.
- **EF-5 — Fin.** Après « Terminer la session » : titre `{n} notions revues en {m} minutes` (démonstration : `5 notions revues en 5 minutes`), cartes `{ok}` / `{soon}` / `{s} j` (démonstration : 4, 1, 13 j), phrase « Prochaine session : … » et « Retour à l'accueil » identiques à SPEC-701.
- **EF-6 — Coexistence avec la session complète.** Les deux sessions du jour sont indépendantes et reprenables ; changer de mode ne perd rien. Une notion notée dans l'une n'est plus due et n'est pas tirée dans l'autre si celle-ci est créée ensuite ; si l'autre session existe déjà et contient cette notion, son item est conservé (réviser deux fois le même jour est sans danger, FSRS gère l'écart court).
- **EF-7 — Série.** Terminer une micro-séance avec au moins une réponse non passée rend la journée qualifiante (`daily_activity.sources` contient `micro_session`), une seule fois par jour quel que soit le nombre de sessions.
- **EF-8 — État vide.** Aucune notion due : même état vide que SPEC-701 ; la micro-séance n'invente pas de révision.
- **EF-9 — Mode imposé par le paramètre d'URL.** `?mode=micro` ouvre directement la micro-séance (lien de la notification de SPEC-713) ; une valeur inconnue est ignorée (mode complet).

## 6. Exigences techniques

- **ET-1 — API.** `GET /api/v1/formations/:fid/global-quiz/today?mode=micro` (route existante de SPEC-701) renvoie un `GlobalQuizSessionDto` avec `mode: 'micro'`. Aucune route nouvelle.
- **ET-2 — Service.** Dans `getOrCreateTodaySession`, quand `mode === 'micro'` : lire `durationMin` de l'automatisme 2 ; appeler `selectGlobalQuizSession` en mode micro ; si le moteur renvoie plus d'items qu'autorisé par ADR-0182, tronquer (cartes d'abord, puis la question) ; `config.estimatedSec = durationMin × 60` ; `config.rationale` = puces d'EF-4.
- **ET-3 — Choix de la question.** Ordre de préférence des formats de la question : `cloze`, `matching`, `categorization`, `choice_question` ; un format n'est retenu que si `pickVariant` trouve une variante non vue couvrant au moins une notion prioritaire. Tant que SPEC-702 n'est pas terminée, la liste est restreinte à `choice_question` (drapeau de configuration `GAMES_ENABLED` de `packages/config/src/product.ts`, mis à `true` par SPEC-702).
- **ET-4 — Journal FSRS.** Les réponses d'une micro-séance utilisent `source = 'micro_session'` dans `review_logs` (valeur existante de l'énumération `review_source`).
- **ET-5 — Événement.** `completeReviewSession` émet, après commit, l'événement **nouveau** `review/session-completed` `{ userId, formationId, sessionId, mode, forDate, reviewedCount }` ajouté au catalogue `packages/jobs/src/events.ts` et au tableau de `docs/architecture/overview.md` §5 (émis par SPEC-703, consommé par SPEC-713 pour marquer la proposition de micro-séance « consommée » et par SPEC-723 pour les notifications de jalons).
- **ET-6 — Client.** `SessionModeSwitch` devient interactif : état dérivé de `searchParams.mode` ; clé TanStack Query `['global-quiz', fid, mode]` ; pendant le chargement de l'autre mode, la zone de jeu affiche un squelette et le sélecteur reste utilisable ; le focus reste sur le bouton cliqué.
- **ET-7 — Accessibilité.** Le changement de mode est annoncé (`aria-live="polite"` : « Micro-séance chargée » / « Séance complète chargée ») ; le sélecteur est un groupe de boutons à `aria-pressed` (pas des onglets).

## 7. Comportements attendus et cas limites

- **CL-1 — Une seule notion due.** La micro-séance ne contient qu'une carte de rappel ; note : `Version courte de secours : une carte de rappel.` ; libellé `Jeu 1 sur 1`.
- **CL-2 — Aucune variante de question disponible.** La micro-séance se limite aux cartes ; `requestRefill` est demandé pour le format manquant ; note de CL-1 adaptée (`une carte de rappel` / `deux cartes de rappel`).
- **CL-3 — Aucune carte de rappel disponible pour la notion prioritaire.** La notion suivante est essayée ; à défaut de toute carte, la micro-séance contient seulement la question.
- **CL-4 — Session complète déjà terminée.** La micro-séance reste accessible ; si plus aucune notion n'est due, état vide.
- **CL-5 — Micro-séance commencée la veille.** Close à l'ouverture comme en SPEC-701 (CL-2 de SPEC-701).
- **CL-6 — Durée modifiée en cours de journée** (Paramètres › Automatismes) : la session micro déjà créée n'est pas modifiée ; la nouvelle durée s'applique le lendemain ; le libellé du bouton du sélecteur affiche la durée de la session existante.
- **CL-7 — Automatisme 2 désactivé.** La micro-séance reste disponible manuellement avec la durée par défaut paramétrée (la désactivation ne coupe que la proposition automatique de SPEC-713).
- **CL-8 — Formation en pause ou pause globale (SPEC-721).** État « Formation en pause » ; aucune micro-séance.
- **CL-9 — Double clic sur le sélecteur.** Une seule création grâce au verrou consultatif de SPEC-701.
- **CL-10 — Fuseau modifié.** Comme SPEC-701 CL-4.

## 8. Instructions d'implémentation

1. Ajouter `GAMES_ENABLED` (défaut `false`, passé à `true` par SPEC-702) et `MICRO_SESSION_COMPOSITION = { 3: { cards: 1 }, 5: { cards: 1 }, 10: { cards: 2 } }` à `packages/config/src/product.ts`.
2. Étendre `getOrCreateTodaySession` (ET-2, ET-3) et le générateur de justification `packages/services/src/review/rationale.ts` (puce micro, notes d'EF-3 et de CL-1/CL-2). Commit `feat(SPEC-703): composition de la micro-séance`.
3. Ajouter l'événement `review/session-completed` (schéma Zod) dans `packages/jobs/src/events.ts`, l'émettre dans `completeReviewSession` via le helper d'émission après commit (SPEC-203), mettre à jour `docs/architecture/overview.md` §5.
4. Rendre `SessionModeSwitch` interactif (ET-6, ET-7) et adapter `GlobalQuizHeader`, `SessionProgress`, `SessionEnd` au mode. Textes dans `apps/web/messages/fr.ts` (`globalQuiz.micro`). Commit `feat(SPEC-703): sélecteur et écran de micro-séance`.
5. Compléter le seed SPEC-115 n'est pas du ressort de cette spécification : vérifier que la micro-séance de démonstration se crée à partir des données seedées (carte « Variante d’exercice » et texte à trous « Fiori et devises » rattaché à 4 notions) ; sinon ajouter une fabrique de test dédiée dans `packages/testing/src/factories/global-quiz.ts`.
6. Tests (§12). Commit `test(SPEC-703): …`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/testing/src/factories/global-quiz.ts` (si absent) ; `apps/web/e2e/specs/p7/micro-session.spec.ts` ; tests unitaires et d'intégration de §12.
- **Modifiés** : `packages/config/src/product.ts` ; `packages/services/src/review/global-quiz.ts` ; `packages/services/src/review/rationale.ts` ; `packages/jobs/src/events.ts` ; `docs/architecture/overview.md` (événement) ; `apps/web/components/global-quiz/{SessionModeSwitch,GlobalQuizHeader,SessionProgress,SessionEnd}.tsx` ; `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : tout SPEC-701 ; `selectGlobalQuizSession` (mode micro) ; `packages/contracts/src/automations.ts` (valeurs par défaut de l'automatisme 2, livré par SPEC-711 ; avant SPEC-711, la valeur 5 de `product.ts`).

## 10. Interface et conformité visuelle

- **Maquette** : `design/maquettes/QuizGlobal.dc.html` avec `micro = true`. **Référence** : `design/references/SCR-10-micro-desktop.png` (nom à aligner sur le manifeste de SPEC-005).
- **Structure et textes (démonstration, horloge 2026-11-11T12:20:00Z)** :
  - `gq-mode-micro` pressé « Micro-séance · 5 min » ; `gq-mode-full` « Séance complète · 10 min » non pressé (fond transparent, texte `#62626B`, graisse 500).
  - `gq-mode-note` : « Version courte de secours : une carte de rappel et une question. Elle garde le rythme et la série les jours chargés. Régler ».
  - Pastilles : « 5 notions », « Modules 1 et 2 mêlés », « ≈ 5 min ».
  - Progression : 2 segments, « Jeu 1 sur 2 ».
  - Rail : `gq-rail-item-1` « Carte de rappel » / « Variante d’exercice » / « Choisi pour votre oubli » / « En cours » ; `gq-rail-item-2` « Texte à trous » / « Fiori et devises » / « À venir ».
  - Zone de jeu identique au recto de SPEC-701.
  - Fin : « 5 notions revues en 5 minutes », « 4 », « 1 », « 13 j ».
- **Contrôles** : `expectTokens` du sélecteur (pressé `#111113`/`#FFFFFF`, non pressé `#62626B`), structure ci-dessus, comparaison ≤ 12 % avec la référence micro, ligne de base `toHaveScreenshot('micro-session.png')` et `('micro-session-fin.png')`.
- **Responsive** : sélecteur pleine largeur sous 480 px, boutons ≥ 44 px de haut.

## 11. Critères d'acceptation

- **CA-1** — Cliquer « Micro-séance · 5 min » remplace l'URL par `?mode=micro`, presse le bouton, affiche la note exacte d'EF-3, « Jeu 1 sur 2 » et un rail de deux jeux.
- **CA-2** — Pour D = 5 la micro-séance contient exactement une carte de rappel puis une question ; pour D = 10, deux cartes puis une question ; pour D = 3, une carte puis une question.
- **CA-3** — La carte porte sur la notion prioritaire (lacune avant notion simplement due).
- **CA-4** — Terminer la micro-séance avec une réponse rend `daily_activity.qualifying = true` avec la source `micro_session` et émet `review/session-completed` avec `mode = 'micro'`.
- **CA-5** — Les réponses écrivent `review_logs.source = 'micro_session'`.
- **CA-6** — Revenir en « Séance complète » restitue la session complète dans l'état où elle était (items déjà répondus conservés).
- **CA-7** — Le scénario de démonstration aboutit à « 5 notions revues en 5 minutes », 4 / 1 / « 13 j ».
- **CA-8** — Conformité visuelle de l'état micro (jetons, structure, écart ≤ 12 %) et aucune violation axe serious/critical.

## 12. Plan de tests

- **Unitaires** :
  - `packages/services/src/review/micro-composition.test.ts` — `describe('[SPEC-703] composition de la micro-séance')` : D = 3/5/10 (CA-2), préférence des formats de question, `GAMES_ENABLED=false` → question à choix, CL-1 à CL-3.
  - `packages/services/src/review/rationale.test.ts` — `describe('[SPEC-703] notes de la micro-séance')` : textes exacts d'EF-3/EF-4/CL-1.
  - `apps/web/components/global-quiz/SessionModeSwitch.test.tsx` — `describe('[SPEC-703] SessionModeSwitch')` : `aria-pressed`, `router.replace`, annonce `aria-live`.
- **Intégration** — `packages/services/test/integration/micro-session.test.ts`, `describe('[SPEC-703] micro-séance')` : création idempotente par mode ; priorité lacune (CA-3) ; source `micro_session` (CA-5) ; clôture → `daily_activity`, événement `review/session-completed` capturé par le client Inngest de test (CA-4) ; coexistence des deux modes (CA-6) ; durée modifiée en cours de journée (CL-6).
- **End-to-end** — `apps/web/e2e/specs/p7/micro-session.spec.ts` (vidéo) :
  - `test('micro-séance de démonstration @SPEC-703')` : `/formations/<sap>/quiz-global` → « Micro-séance · 5 min » → vérifier URL, note, rail ; retourner la carte, « Bon » ; « Suivant » ; jeu 2 (texte à trous si SPEC-702 est terminée, sinon « Passer ») ; « Terminer la session » ; textes de fin (CA-1, CA-7).
  - `test('retour à la séance complète @SPEC-703')` : répondre au jeu 1 en mode complet, passer en micro, revenir → jeu 1 « Fait » (CA-6).
  - `test('lien direct ?mode=micro @SPEC-703')` : ouverture directe en mode micro.
  - `expectNoAxeViolations` sur l'état micro.
- **Visuel** — `test('micro-séance conforme @SPEC-703 @visual')` : `expectTokens`, structure, `compareWithReference(page, 'SCR-10-micro-desktop')` ≤ 12 %, `toHaveScreenshot` (CA-8).
- **Non-régression** : `@SPEC-701`, `@SPEC-702`, `[SPEC-406]`, `[SPEC-409]`.
- **Traçabilité** :

| Critère | Tests |
|---|---|
| CA-1 | unitaire `SessionModeSwitch` ; e2e démonstration `@SPEC-703` |
| CA-2 | unitaire composition `[SPEC-703]` |
| CA-3 | intégration `[SPEC-703]` |
| CA-4 | intégration (clôture, événement) |
| CA-5 | intégration (source) |
| CA-6 | intégration ; e2e retour à la séance complète |
| CA-7 | e2e démonstration |
| CA-8 | `@SPEC-703 @visual` ; axe |

## 13. Preuves attendues

`evidence/SPEC-703/` : `video/micro-seance.webm`, `video/retour-seance-complete.webm` ; captures `screenshots/micro-recto.png`, `micro-fin.png` ; `visual/SCR-10-micro-side-by-side.png` et diff avec taux ; rapports Vitest/Playwright ; extrait de l'événement `review/session-completed` capturé (JSON) dans `summary.md`.

## 14. Définition de terminé

Définition commune (docs/engineering/testing.md §7) ; en plus : l'événement `review/session-completed` est présent dans le catalogue typé et documenté dans `docs/architecture/overview.md` ; la micro-séance est jouable sans SPEC-713 (accès manuel).

## 15. Décisions et hypothèses

- **ADR appliqués** : ADR-0180 (cycle de session, mode `micro`), ADR-0033 (série), ADR-0025.
- **Décision prise (ADR-0182)** : composition de la micro-séance — une carte de rappel (deux si D = 10) puis une question de préférence multi-notions ; durée affichée = D ; deux sessions indépendantes par jour (complète, micro) ; série comptée une fois par jour.
- **Nouvel élément signalé** : événement de domaine `review/session-completed` (catalogue `packages/jobs/src/events.ts`).
- **Hypothèses** : SPEC-406 accepte `mode: 'micro'` ; à défaut, le service compose la micro-séance à partir du tirage complet (premières notions prioritaires) selon ADR-0182. Le jeu de démonstration SPEC-115 rattache le texte à trous « Fiori et devises » à 4 notions pour obtenir « 5 notions ».
