---
id: SPEC-702
title: "Jeux : association, remise en ordre, classement, texte à trous"
phase: P7
priority: V1
depends_on: [SPEC-701]
business_rules: [BR-MEM-05, BR-MEM-10]
screens: [SCR-10]
adrs: [ADR-0181]
visual: mockup
---

# SPEC-702 — Jeux : association, remise en ordre, classement, texte à trous

## 1. Objectif

Rendre jouables, dans la session de quiz global de SPEC-701, les quatre jeux de mémorisation autres que la carte de rappel — **association**, **remise en ordre**, **classement**, **texte à trous** — exactement comme dans `design/maquettes/QuizGlobal.dc.html` (sélection à la souris et au clavier, vérification, recommencer, réponses attendues), avec une **correction entièrement faite par le code** et l'enregistrement des **confusions** entre notions révélées par les erreurs d'association et de classement.

## 2. Contexte

Les jeux sont des formes de rappel actif, pas des récompenses (vision §2). Ils sont générés à l'avance dans les banques (SPEC-513) au format des briques `matching`, `ordering`, `categorization`, `cloze` (SPEC-501), corrigés par `grade.ts` (SPEC-502) et rendus par les vues de SPEC-503. Cette spécification assemble ces briques dans la zone de jeu de SPEC-701, câble la vérification sur `POST /review-sessions/:sid/answers` et transforme le résultat en notes FSRS par notion et en signaux de confusion pour le moteur de lacunes (BR-LAC-03).

Lire : `design/maquettes/QuizGlobal.dc.html` (blocs `isG2` à `isG5` et le script : `leftTiles`, `rightTiles`, `orderItems`, `classItems`, `buckets`, `gapStyle`), `docs/product/business-rules.md` (MEM-05, MEM-10, LAC-03, BRI-08), `docs/architecture/data-model.md` §5, SPEC-701 (contrats et flux), ADR-0024, ADR-0025, ADR-0181.

## 3. Dépendances

- **SPEC-701** : écran, `GamePanel`, contrats `ReviewItemDto` / `ReviewAnswerInput` / `ReviewAnswerResultDto`, service `answerReviewItem`, pied Passer/Suivant.
- Via SPEC-701 : **SPEC-503** (`MatchingView`, `OrderingView`, `CategorizationView`, `ClozeView`, `toClientPayload`), **SPEC-502** (`gradeMatching`, `gradeOrdering`, `gradeCategorization`, `gradeCloze`, normalisation `normalizeAnswer` : minuscules, sans accents, espaces réduits), **SPEC-411** (`applyReviewResult` avec champ facultatif `confusedWithNotionId`), **SPEC-402** (`ratingFromAnswer`), **SPEC-115** (items 2 à 5 de la session de démonstration).
- Externes : aucune ; aucun appel IA (BR-IA-09).

## 4. Règles métier couvertes

- **BR-MEM-05** — Les quatre jeux sont implémentés selon la maquette ; la correction est faite exclusivement par `grade.ts` côté serveur ; le texte à trous n'offre aucune liste de choix et compare sans casse ni accents, en acceptant les variantes de la brique ; une erreur d'association ou de classement entre deux notions est transmise au moteur comme confusion (`confusedWithNotionId`).
- **BR-MEM-10** — Dès la vérification, chaque élément est coloré juste/faux, la réponse attendue et l'explication de la brique sont affichées dans une région `aria-live`, et la réponse est verrouillée.

## 5. Exigences fonctionnelles

- **EF-1 — Association.** Consigne `Touchez une notion, puis la définition qui lui correspond.` Deux colonnes : à gauche les termes (boutons numérotés 1..n, `aria-pressed` = sélectionné), à droite les définitions (boutons avec pastille vide en pointillé tant qu'aucun terme n'y est associé, puis le numéro du terme associé). Sélectionner un terme puis une définition crée la paire ; associer une définition déjà prise à un autre terme déplace la paire ; resélectionner un terme remplace sa paire. Boutons `Vérifier` (noir) et `Recommencer` (contour) : `Recommencer` efface toutes les paires avant vérification. `Vérifier` est désactivé tant que tous les termes ne sont pas associés.
- **EF-2 — Remise en ordre.** Consigne propre à la brique (démonstration : `Remettez les niveaux de l'organisation SAP dans l'ordre, du plus large au plus fin.`). Liste ordonnée : position, libellé, boutons `Monter` et `Descendre` (libellés accessibles exacts) ; `Monter` désactivé en tête, `Descendre` en fin. L'ordre initial est l'ordre mélangé figé dans la brique (démonstration : Société, Magasin, Mandant, Division). Bouton `Vérifier l'ordre`.
- **EF-3 — Classement.** Consigne de la brique (démonstration : `Classez chaque élément : donnée de base ou opération ?`). En haut, une zone en pointillé par catégorie (`Donnée de base`, `Opération`) qui affiche les éléments déjà rangés sous forme de pastilles noires. En dessous, une ligne par élément : libellé et groupe de boutons à `aria-pressed` (un par catégorie, `role="group"` libellé par l'élément). Bouton `Vérifier le classement`, désactivé tant qu'un élément n'est pas classé.
- **EF-4 — Texte à trous.** Consigne `Complétez de tête, sans liste de choix.` Texte avec champs de saisie en ligne (libellés accessibles `Premier mot manquant`, `Second mot manquant`, `Troisième mot manquant`, puis `Mot manquant n°{i}` au-delà de trois). Bouton `Vérifier`, désactivé tant qu'un trou est vide (après suppression des espaces). Après vérification : `Réponses attendues : {r1} et {r2}.` (séparateurs : virgules puis « et » avant le dernier ; `Réponse attendue : {r}.` pour un seul trou) avec les réponses en gras.
- **EF-5 — Correction affichée.** Après vérification : éléments justes bordure 1,5 px `#14A38B` et fond `#E1F4EF` (texte `#0B5C4D`) ; faux bordure 1,5 px `#F97316` et fond `#FFEDE0` (texte `#8F3305`). Sous chaque élément faux, une ligne : association `Attendu : {terme}` (sous la définition), remise en ordre `Position attendue : {n}`, classement `Attendu : {catégorie}` ; texte à trous : EF-4. Puis un paragraphe `Explication` contenant `payload.explanation` s'il existe. Les contrôles du jeu (tuiles, flèches, choix, champs, Vérifier, Recommencer) deviennent `disabled` ; `Suivant` devient actif et `Passer` inactif.
- **EF-6 — Clavier.** Tous les éléments sont des boutons ou champs natifs atteignables par Tab ; Entrée/Espace sélectionne ; dans la remise en ordre, après `Monter`/`Descendre` le focus suit l'élément déplacé sur le même bouton (ou sur l'autre bouton s'il devient désactivé) ; Entrée dans le dernier trou déclenche `Vérifier` si actif.
- **EF-7 — Reprise.** Un jeu déjà vérifié, rouvert depuis le rail ou après rechargement, s'affiche en lecture seule avec la réponse donnée et sa correction (données de `ReviewItemDto.result`).
- **EF-8 — Effets.** Chaque vérification met à jour FSRS de chaque notion de l'item (ET-4) et, pour une erreur entre deux notions, enregistre la confusion ; le statut de l'item passe `Fait` dans le rail.

## 6. Exigences techniques

- **ET-1 — Réponses** (`response` de `ReviewAnswerInput`, schémas Zod dans `packages/contracts/src/review.ts`) :
  - association `{ pairs: { leftId: string, rightId: string }[] }` ;
  - remise en ordre `{ order: string[] }` (identifiants d'étapes, permutation complète) ;
  - classement `{ assignments: { itemId: string, categoryId: string }[] }` ;
  - texte à trous `{ gaps: { gapId: string, value: string /* ≤ 120 caractères */ }[] }`.
  Une réponse incomplète ou un identifiant inconnu → 400 `VALIDATION_FAILED`.
- **ET-2 — Correction** (`answerReviewItem` de SPEC-701, `gradeBrick` de SPEC-502) renvoie `correction` :
  - association `{ pairs: { leftId, rightId, ok, expectedRightId, expectedLeftLabel }[] }` ;
  - remise en ordre `{ rows: { stepId, position, ok, expectedPosition }[] }` ;
  - classement `{ rows: { itemId, categoryId, ok, expectedCategoryId, expectedCategoryLabel }[] }` ;
  - texte à trous `{ gaps: { gapId, ok, expected: string /* forme canonique */ }[] }` ;
  plus `explanation` (chaîne ou `null`) et `isCorrect` (tout juste). `answers.score` = part d'éléments justes × `max_score` (1).
- **ET-3 — Normalisation du texte à trous** : `normalizeAnswer(s) = s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/\s+/g,' ').trim()` puis retrait d'une ponctuation finale `.;:!?` ; juste si égal à la normalisation de la réponse canonique ou d'une variante acceptée. Aucune tolérance aux fautes d'orthographe hors variantes.
- **ET-4 — Notes par notion** (ADR-0181) : pour chaque notion de l'item, `correct = tous les éléments rattachés à cette notion sont justes` ; `timeMs` de la notion = `timeMs` de l'item ÷ nombre de notions ; note = `ratingFromAnswer({ correct, timeMs, medianMs })` avec la médiane du format (ADR-0025). Remise en ordre et texte à trous rattachés à une seule notion : `correct = isCorrect`.
- **ET-5 — Confusions** : association — une définition de la notion B associée au terme de la notion A (A ≠ B) → `applyReviewResult(notion A, { correct: false, confusedWithNotionId: B })` ; classement — si les catégories portent un `notionId`, un élément de la catégorie de la notion A rangé dans la catégorie de la notion B → confusion A↔B ; sinon, erreur simple sur la notion de l'élément. Les confusions sont aussi listées dans `answers.feedback.confusions = [{ notionId, withNotionId }]`. La détection de la lacune « confusion » et le lien personnel `notion_links(kind='confusion', owner_id)` sont faits par SPEC-411/404.
- **ET-6 — Composants client** (`apps/web/components/global-quiz/games/`) : `MatchingGame.tsx`, `OrderingGame.tsx`, `CategorizationGame.tsx`, `ClozeGame.tsx`, `GameCorrection.tsx` ; chacun reçoit `{ item, onSubmit(response), result }`, gère l'état local avant vérification et n'importe que `@learny/ui` et les vues de `@learny/bricks`.
- **ET-7 — Sécurité** : `toClientPayload` retire `pairs` corrects, `correctOrder`, catégories attendues et réponses des trous ; l'ordre affiché des définitions est un mélange déterministe (graine = `brickVersionId`) pour éviter de révéler l'ordre des paires.
- **ET-8 — Accessibilité** : tuiles d'association `aria-pressed` ; définitions avec `aria-label="{définition}, associée au terme {n}"` quand associée ; listes `ol`/`ul` sémantiques ; couleurs juste/faux doublées d'un texte (`Juste`/`Faux` en visuellement masqué) pour ne pas dépendre de la couleur (WCAG 1.4.1).

## 7. Comportements attendus et cas limites

- **CL-1 — Vérification incomplète** : impossible côté interface (bouton désactivé) ; côté API, 400.
- **CL-2 — Double vérification / double clic** : même `clientAnswerId` → un seul enregistrement (SPEC-701).
- **CL-3 — Saisie avec accents, majuscules, espaces** : « Tuile » , « TUILE », « tuile. », «  tuile  » sont justes ; « tuille » est faux.
- **CL-4 — Variante acceptée** : une brique cloze dont le trou accepte `["devise interne","interne"]` accepte les deux.
- **CL-5 — Association à soi-même** : une définition associée par erreur au terme d'une même notion (paires multiples d'une notion) n'est pas une confusion, seulement une erreur.
- **CL-6 — Classement sans notion de catégorie** : aucune confusion enregistrée, uniquement des erreurs (ET-5).
- **CL-7 — Brique corrompue** (schéma invalide en base) : l'item est marqué `withdrawn`, la brique passe `retired` par `bricks.retireInvalid` (SPEC-501), un message `Ce jeu n’est plus disponible.` remplace la zone et `Suivant` est actif.
- **CL-8 — Rechargement avant vérification** : l'état local est perdu (non enregistré), le jeu repart de l'état initial.
- **CL-9 — Jeu ouvert depuis le rail après la clôture** : lecture seule.
- **CL-10 — Longs libellés** : coupure de mots (`overflow-wrap: anywhere`), hauteur minimale des tuiles 64 px (à l'échelle maquette).

## 8. Instructions d'implémentation

1. Ajouter les schémas de réponse et de correction (ET-1, ET-2) à `packages/contracts/src/review.ts` ; union discriminée par `type`. Commit `feat(SPEC-702): contrats des réponses de jeux`.
2. Dans `packages/services/src/review/global-quiz.ts`, étendre `answerReviewItem` : aiguillage par type vers `gradeBrick`, calcul des notes par notion (ET-4), confusions (ET-5), stockage de `feedback = { clientAnswerId, correction, confusions }`.
3. Écrire `packages/services/src/review/per-notion.ts` : `splitResultByNotion(type, payload, correction): { notionId, correct, confusedWithNotionId? }[]` (pure, testée).
4. Créer les composants d'ET-6 en suivant la maquette : états `idle`, `submitting`, `checked` ; mélange déterministe (ET-7) dans `apps/web/lib/shuffle.ts` (`seededShuffle(items, seed)` basé sur `mulberry32` d'un hachage FNV-1a de la graine).
5. Brancher les composants dans `GamePanel` (SPEC-701) à la place du rendu lecture seule provisoire ; textes dans `apps/web/messages/fr.ts` section `globalQuiz.games`. Commit `feat(SPEC-702): jeux association, remise en ordre, classement, texte à trous`.
6. Tests (§12). Commit `test(SPEC-702): …`.

## 9. Fichiers et composants concernés

- **Créés** : `apps/web/components/global-quiz/games/{MatchingGame,OrderingGame,CategorizationGame,ClozeGame,GameCorrection}.tsx` ; `packages/services/src/review/per-notion.ts` ; `apps/web/lib/shuffle.ts` ; tests de §12.
- **Modifiés** : `packages/contracts/src/review.ts` ; `packages/services/src/review/global-quiz.ts` ; `apps/web/components/global-quiz/GamePanel.tsx` ; `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `@learny/bricks` (schémas, `grade.ts`, vues), `packages/services/src/learning` (`applyReviewResult`), `@learny/ui` (`Button`, `SegmentedControl`, `TextField` en variante en ligne).

## 10. Interface et conformité visuelle

- **Maquette** : `design/maquettes/QuizGlobal.dc.html`, états jeux 2 à 5 ; **références** `design/references/SCR-10-association-desktop.png`, `SCR-10-ordre-desktop.png`, `SCR-10-classement-desktop.png`, `SCR-10-trous-desktop.png` (noms à aligner sur le manifeste de SPEC-005 ; à défaut, capture de l'état correspondant produite depuis la maquette par le test avec `?state` simulé).
- **Structure et textes (démonstration)** :
  - `[data-testid=game-matching]` : consigne ; `matching-left-1..3` « Société », « Plan comptable », « Launchpad Fiori » (pastille numéro fond `#111113`) ; `matching-right-1..3` « Liste des comptes généraux utilisables », « Page d’accueil qui regroupe les applications », « Entité juridique qui tient sa propre comptabilité » (bordure pointillée `#C9C8C1` non associée ; bordure `#111113` fond `#F4F4F1` associée ; sélectionnée : bordure 2 px `#111113`) ; `matching-verify` « Vérifier », `matching-reset` « Recommencer ». En-tête de jeu : « Association », « Notions de base SAP · Modules 1 et 2 », pastille « Notions proches ».
  - `[data-testid=game-ordering]` : consigne ; `ordering-item-1..4` (fond `#F8F8F6`, bordure `#E7E6E1`, rayon 18 px) « Société », « Magasin », « Mandant », « Division » ; boutons 44×44 px `ordering-up-{i}` (« Monter »), `ordering-down-{i}` (« Descendre ») ; `ordering-verify` « Vérifier l'ordre » ; ordre attendu Mandant, Société, Division, Magasin. En-tête : « Remise en ordre », « Niveaux d’organisation · Module 2 », « Séquence ».
  - `[data-testid=game-categorization]` : consigne ; `categorization-bucket-1` « Donnée de base », `categorization-bucket-2` « Opération » (pointillé 1,5 px `#C9C8C1`, rayon 18 px) ; lignes `categorization-row-1..6` « Compte général », « Fournisseur », « Facture d’achat », « Paiement », « Client », « Écriture de régularisation » avec `categorization-choice-{i}-{1|2}` ; `categorization-verify` « Vérifier le classement ». En-tête : « Classement », « Données de base et opérations · Module 1 », « Catégorisation ».
  - `[data-testid=game-cloze]` : consigne ; texte « Dans SAP Fiori, chaque application s'ouvre depuis une [ ] du launchpad, et une société tient sa comptabilité dans sa devise [ ]. » (Space Grotesk 24 px, interligne 2) ; `cloze-gap-1`, `cloze-gap-2` (largeur 150 px, fond `#F4F4F1`, soulignement intérieur 2 px `#111113`) ; `cloze-verify` « Vérifier » ; `cloze-expected` « Réponses attendues : tuile et interne. ». En-tête : « Texte à trous », « Fiori et devises · Modules 1 et 2 », « Rappel actif ».
  - `[data-testid=game-explanation]` après vérification.
- **Contrôles automatisés** : `expectTokens` (couleurs juste/faux, rayon des tuiles, police Space Grotesk du texte à trous), structure et textes ci-dessus, comparaison ≤ 12 % pour chaque état de référence disponible, ligne de base `toHaveScreenshot` par jeu (avant et après vérification).
- **Responsive** : association en une colonne sous 600 px (termes puis définitions) ; lignes de classement repliées (libellé au-dessus des choix).

## 11. Critères d'acceptation

- **CA-1** — Association : former les trois bonnes paires puis « Vérifier » colore les 6 tuiles en vert, enregistre `is_correct = true` et une note non `again` pour chaque notion concernée.
- **CA-2** — Association : associer « Société » à la définition du plan comptable enregistre une confusion (`feedback.confusions` contient la paire de notions) et `applyReviewResult` reçoit `confusedWithNotionId`.
- **CA-3** — Remise en ordre : les boutons « Monter »/« Descendre » permutent les éléments, sont désactivés aux extrémités, et l'ordre Mandant, Société, Division, Magasin est jugé juste ; un ordre partiellement faux affiche « Position attendue : n » sur chaque ligne fausse.
- **CA-4** — Classement : « Vérifier le classement » est inactif tant qu'un élément n'est pas classé ; les zones affichent les éléments rangés ; un élément mal classé affiche « Attendu : {catégorie} ».
- **CA-5** — Texte à trous : « Tuile » et « INTERNE » sont jugés justes, « tuille » faux ; « Réponses attendues : tuile et interne. » apparaît après vérification.
- **CA-6** — Après vérification, la réponse est verrouillée (contrôles désactivés), l'explication est annoncée dans une région `aria-live`, et rouvrir le jeu depuis le rail l'affiche en lecture seule.
- **CA-7** — Les solutions ne figurent pas dans la réponse de `GET today` (contrôle de la charge JSON).
- **CA-8** — Parcours complet au clavier des quatre jeux sans souris ; aucune violation axe serious/critical.
- **CA-9** — Conformité visuelle des quatre états (jetons, structure, écart ≤ 12 %).

## 12. Plan de tests

- **Unitaires** :
  - `packages/services/src/review/per-notion.test.ts` — `describe('[SPEC-702] splitResultByNotion')` : association avec confusion A↔B ; même notion (CL-5) ; classement avec et sans `notionId` de catégorie (CL-6) ; ordre et trous mono-notion.
  - `apps/web/lib/shuffle.test.ts` — `describe('[SPEC-702] seededShuffle')` : déterminisme et permutation.
  - `apps/web/components/global-quiz/games/*.test.tsx` — `describe('[SPEC-702] MatchingGame|OrderingGame|CategorizationGame|ClozeGame')` : interactions (création/déplacement de paires, Recommencer, flèches et focus, activation de Vérifier), rendu de la correction et verrouillage.
- **Intégration** — `packages/services/test/integration/global-quiz-games.test.ts`, `describe('[SPEC-702] correction des jeux')` : chaque type juste/faux → `answers.score`, `is_correct`, `review_logs` par notion, confusions (CA-1, CA-2, CA-3, CA-5) ; normalisation (CL-3, CL-4) ; 400 sur réponse incomplète ; charge client sans solution (CA-7).
- **End-to-end** — `apps/web/e2e/specs/p7/global-quiz-games.spec.ts` (vidéo) :
  - `test('association, ordre, classement, trous @SPEC-702')` : ouvrir la session de démonstration, passer la carte, jouer les jeux 2 à 5 avec une erreur volontaire en association et une en classement, vérifier couleurs, « Attendu : … », « Réponses attendues : tuile et interne. », verrouillage, rail « Fait » (CA-1 à CA-6).
  - `test('jeux au clavier @SPEC-702')` : mêmes jeux uniquement au clavier + `expectNoAxeViolations` (CA-8).
- **Visuel** — `test('conformité des jeux @SPEC-702 @visual')` : pour chaque jeu, `expectTokens`, structure, `compareWithReference` ≤ 12 %, `toHaveScreenshot` (CA-9).
- **Non-régression** : `@SPEC-701`, `[SPEC-502]`, `[SPEC-503]`, `[SPEC-411]`.
- **Traçabilité** :

| Critère | Tests |
|---|---|
| CA-1 | intégration `[SPEC-702]` ; e2e `@SPEC-702` |
| CA-2 | unitaire `splitResultByNotion` ; intégration |
| CA-3 | unitaire `OrderingGame` ; intégration ; e2e |
| CA-4 | unitaire `CategorizationGame` ; e2e |
| CA-5 | intégration (normalisation) ; e2e |
| CA-6 | unitaires des jeux ; e2e |
| CA-7 | intégration (charge client) |
| CA-8 | e2e clavier + axe |
| CA-9 | `@SPEC-702 @visual` |

## 13. Preuves attendues

`evidence/SPEC-702/` : `video/jeux.webm`, `video/jeux-clavier.webm` ; captures `screenshots/association-{avant,apres}.png`, `ordre-{avant,apres}.png`, `classement-{avant,apres}.png`, `trous-{avant,apres}.png` ; comparaisons `visual/*-side-by-side.png` et diffs avec taux ; rapports Vitest et Playwright.

## 14. Définition de terminé

Définition commune (docs/engineering/testing.md §7) ; en plus : aucune solution de jeu n'est présente dans le DOM avant vérification ; les confusions alimentent bien la page « Mes lacunes » (une confusion créée en e2e apparaît sur `/formations/[fid]/lacunes?nature=confusion` après traitement de `review/answered`).

## 15. Décisions et hypothèses

- **ADR appliqués** : ADR-0024 (même erreur, normalisation, nature confusion), ADR-0025 (note déduite de la justesse et du temps), ADR-0020, ADR-0180 (cycle de session).
- **Décision prise (ADR-0181)** : une seule vérification notée par jeu, verrouillée ensuite (« Recommencer » n'agit qu'avant vérification) ; « Vérifier » actif seulement quand le jeu est complet ; note FSRS par notion calculée sur les éléments de la notion, temps réparti ; confusion enregistrée pour toute erreur croisant deux notions ; affichage systématique de la réponse attendue et de l'explication.
- **Hypothèses** : les schémas SPEC-501 rattachent chaque paire, étape, élément et trou à une notion (`notionId`) et les catégories peuvent porter un `notionId` facultatif ; `applyReviewResult` (SPEC-411) accepte `confusedWithNotionId` — si ce n'est pas le cas, l'implémenteur l'ajoute dans SPEC-411 par une modification rétrocompatible. Aucune route ni colonne nouvelle.
