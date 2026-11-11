---
id: SPEC-716
title: "Automatisme 5 : jeu choisi selon la lacune"
phase: P7
priority: V1
depends_on: [SPEC-711, SPEC-406]
business_rules: [BR-AUT-05]
screens: [SCR-10]
adrs: [ADR-0190, ADR-0193]
visual: tokens
---

# SPEC-716 — Automatisme 5 : jeu choisi selon la lacune

## 1. Objectif

Livrer l'automatisme `jeu_lacune` : à chaque lacune détectée, choisir le format d'entraînement selon sa nature (confusion → association ou classement opposant les deux notions ; oubli → carte de rappel ; difficulté d'application → exercice planifié), appliquer la préférence de jeux de l'apprenant, afficher la raison du choix dans le quiz global (« Choisi pour votre oubli ») et journaliser chaque choix.

## 2. Contexte

Troisième automatisme du groupe « Quiz et jeux ». Le tirage de la session de quiz global est livré par SPEC-406 (paramètre de format imposé et préférence prévus par son périmètre : « choix du format selon la nature de la lacune (préférences) ») ; l'écran SCR-10 (`design/maquettes/QuizGlobal.dc.html`) affiche le rail des jeux avec la raison en orange (`#8F3305`) et l'encadré « Réglé par le tuteur ». Les priorités entre formats imposés sont fixées par ADR-0193.

À lire : BR-AUT-05, BR-LAC-03, BR-LAC-04, BR-MEM-04, BR-MEM-05, BR-MEM-08 ; `docs/architecture/data-model.md` §5–§7 ; `design/maquettes/QuizGlobal.dc.html` (rail, `why: 'Choisi pour votre oubli'`, encadré « Réglé par le tuteur ») ; `design/maquettes/Parametres.dc.html` (automatisme `jeux`, journal « Mer. 08:00 Lacune « équilibre d'une pièce » : exercice pratique placé jeudi 9:00. ») ; ADR-0024, ADR-0026, ADR-0190, ADR-0193.

## 3. Dépendances

- **SPEC-711** : moteur et contrat ADR-0190.
- **SPEC-406** : `buildDailySession(input)` avec `forcedFormats` et `formatPreference` ; si l'un de ces paramètres manque, SPEC-716 l'ajoute (rétrocompatible, défaut : aucun format imposé, préférence `vary`).
- Utilisés : SPEC-404/411 (événements `gap/detected`, `gap/cleared`, `notion_states.gap_nature`, `gap_confused_with`), SPEC-513 (banques : `matching`, `categorization`, `recall_card`, `choice_question` avec distracteurs annotés ; demande de génération d'une brique de confrontation), SPEC-613 (`ensurePracticeExercise(ctx, notionId)` → activité d'exercice), SPEC-407 (`findCompatibleSlots`), SPEC-701 (écran du quiz global).
- IA : uniquement indirecte (génération en lot d'une brique de confrontation ou d'un exercice par les services existants) ; IA indisponible : CL-9.

## 4. Règles métier couvertes

- **BR-AUT-05** : définition `jeu_lacune` ; confusion → association ou classement opposant les deux notions ; oubli → carte de rappel ; difficulté d'application → exercice ; préférence `vary` (défaut), `cards`, `matching` ; raison du choix affichée dans le rail du quiz global et journalisée.

## 5. Exigences fonctionnelles

- **EF-1 Paramètres** (`JeuLacuneParams`) : `preference ∈ {'vary','cards','matching'}` défaut `'vary'`. Libellé (SPEC-710) « Préférence » : « Varier les jeux », « Plutôt des cartes de rappel », « Plutôt association et classement ».
- **EF-2 Déclenchement** : événements `gap/detected` et `gap/nature-changed` (si ce dernier n'existe pas, `gap/detected` porte la nouvelle nature) ; une action par (notion, date de détection).
- **EF-3 Choix selon la nature** (fonction pure `chooseGapFormat`) :
  - `confusion` (avec `gap_confused_with`) : `matching` si la dernière confrontation jouée pour cette paire était un `categorization` ou n'existe pas, sinon `categorization` ; brique choisie dans la banque parmi celles dont `notion_ids` contient les deux notions et jamais vues (empreinte) ; à défaut, une génération en lot est demandée à SPEC-513 (`requestConfrontationBrick(notionA, notionB, format)`) et, en attendant, une `choice_question` de la notion dont un distracteur représente l'autre notion est imposée (même raison affichée) ;
  - `forgetting` : `recall_card` de la notion (banque) ;
  - `application` : exercice pratique planifié (EF-5) ;
  - `misunderstanding` : aucun format imposé (la réponse est une nouvelle explication, BR-LAC-04, hors de cet automatisme) ; aucune action.
- **EF-4 Action « jeu »** : `kind = 'game_chosen'`, `requiresConsent = false`, `payload = { dedupeKey: 'game:<notionId>:<gapDetectedAt>', notionId, notionLabel, nature, confusedWithId|null, confusedWithLabel|null, format, brickId|null, pendingGeneration: boolean }`. `apply` n'écrit rien d'autre : le format est lu au tirage (ADR-0193 §4).
- **EF-5 Action « exercice »** : `kind = 'exercise_scheduled'`, `payload = { dedupeKey, notionId, notionLabel, nature: 'application', exerciseActivityId, slotId }` ; `apply` appelle `ensurePracticeExercise` puis crée un créneau `exercise` (titre « Exercice pratique », `meta` « {intitulé de l'exercice} · ajouté par le tuteur », durée `EXERCISE_DEFAULT_MIN` de `packages/config/src/product.ts`) au premier créneau compatible à partir du lendemain, marge de la formation en priorité. Notification `planning_adjusted`, titre « Exercice ajouté », texte = `summary`, lien vers l'exercice.
- **EF-6 Tirage** : le service de session (`packages/services/src/review/build-session.ts`) construit `forcedFormats` depuis les actions `game_chosen` `applied` non consommées dont la lacune est toujours active, et `formatPreference` depuis les réglages ; préférence pour les notions sans format imposé : `vary` → formats disponibles équiprobables (sauf le dernier joué, BR-MEM-04) ; `cards` → `recall_card` de poids 3, autres poids 1 ; `matching` → `matching` et `categorization` de poids 3, autres poids 1 ; tirage pseudo-aléatoire initialisé par `hash(userId, date)` (déterminisme).
- **EF-7 Affichage dans le quiz global** : pour un élément au format imposé, le rail affiche sous la notion la raison (11 px, gras, `#8F3305`) : « Choisi pour votre oubli », « Choisi pour votre confusion » (tu : « Choisi pour ton oubli », « Choisi pour ta confusion ») ; l'encadré « Réglé par le tuteur » ajoute une ligne « Lacune en priorité : » suivie de : oubli — « {notion}, oubliée depuis le {j mois}, revient en carte de rappel. » ; confusion — « « {A} » et « {B} » se confondent : {une association|un classement} les oppose. ». Ces textes sont fournis par l'API de session (`items[].reason`, `tuned[]`).
- **EF-8 Consommation et expiration** : une réponse enregistrée à l'élément imposé (session jouée) appelle `markConsumed` ; l'exercice fait consomme `exercise_scheduled` ; `gap/cleared` avant consommation → `expired`.
- **EF-9 Explications** :
  - `game_chosen` : confusion — « Lacune « {A} » : {association|classement} « {A} / {B} » ajouté au quiz global. » ; oubli — « Lacune « {A} » : carte de rappel ajoutée au quiz global. » ; dernière action (SPEC-710) : « {quand}, {association|classement|carte de rappel} « {A}{ / B} » ajoutée au quiz global. » ;
  - `exercise_scheduled` : « Lacune « {A} » : exercice pratique placé {jour} {H:mm}. » ;
  - `pendingGeneration` : suffixe « (en préparation) » ; `undone` : « Annulé : … » ; `expired` : « Lacune « {A} » levée avant l'entraînement. ». Aucun pronom : identiques en `vous` et `tu`.
- **EF-10 Annulation** : avant consommation, `undo` retire le format imposé (tirage par défaut) ou, pour un exercice, passe le créneau `cancelled` (l'exercice reste disponible dans le module).

## 6. Exigences techniques

- **ET-1 Schéma** : `JeuLacuneParams = z.object({ preference: z.enum(['vary', 'cards', 'matching']).default('vary') })` ; kinds `game_chosen`, `exercise_scheduled`.
- **ET-2 Définition** `packages/automations/src/definitions/jeu-lacune.ts` : `triggers: [{ type: 'event', name: 'gap/detected' }, { type: 'event', name: 'gap/cleared' }]` (le second pour l'expiration).
- **ET-3 Contrat de session** (`packages/contracts/src/review.ts`) : `items[].reason: { code: 'gap_forgetting'|'gap_confusion'|'question_card', label: string } | null` et `tuned: { label: string, text: string }[]` (lignes de l'encadré) ; champs ajoutés, rétrocompatibles.
- **ET-4 Fonctions pures** dans `packages/learning-engine/src/session/format-choice.ts` (sans I/O, ADR-0020) : `chooseGapFormat({ nature, lastPairFormat, available })`, `weightedFormatPick({ preference, available, lastFormat, seed })`.
- **ET-5 Aucune route nouvelle**.

## 7. Comportements attendus et cas limites

- **CL-1 Automatisme désactivé** : aucun format imposé ni exercice ; la préférence n'est pas appliquée (`vary`).
- **CL-2 Heures calmes** : seule la notification d'exercice est concernée : reportée.
- **CL-3 Plafond** : notification d'exercice `capped` hors application.
- **CL-4 Pause globale** : aucune action ; les lacunes détectées pendant la pause (impossible sans activité) ne sont pas traitées rétroactivement.
- **CL-5 Double déclenchement** : `dedupeKey` (notion, date de détection).
- **CL-6 Annulation après consommation** : refusée (422).
- **CL-7 Changement de nature** (oubli → confusion) : l'action précédente non consommée passe `expired`, une nouvelle est créée.
- **CL-8 Deux lacunes imposant des formats sur la même notion** : une seule (la nature prioritaire de BR-LAC-03 l'emporte).
- **CL-9 Brique de confrontation absente et IA indisponible** : repli sur la `choice_question` à distracteur ; si aucune, aucun format imposé et `payload.pendingGeneration = true` jusqu'à disponibilité.
- **CL-10 Fuseau** : l'exercice est placé dans les moments d'étude locaux ; la date de détection affichée est locale.
- **CL-11 Session du jour déjà générée** : le format imposé s'applique à la prochaine session où la notion apparaît.

## 8. Instructions d'implémentation

1. Fonctions pures `format-choice.ts` et tests par propriétés (jamais deux fois de suite le même format sans format imposé). Commit `feat(SPEC-716): choix du format selon la lacune`.
2. Schéma, kinds, définition `jeu-lacune.ts` (`run`, `apply` pour l'exercice, `explain`, `undo`), enregistrement.
3. Service de session : construction de `forcedFormats` (ADR-0193 §4) et de la préférence ; textes `reason` et `tuned`. Commit `feat(SPEC-716): formats imposés dans la session`.
4. Écran du quiz global : affichage de `reason` dans le rail et des lignes `tuned` dans l'encadré.
5. Tests (section 12). Commit `test(SPEC-716): …`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/learning-engine/src/session/format-choice.ts` (+ tests), `packages/automations/src/definitions/jeu-lacune.ts` (+ test), `packages/automations/test/integration/jeu-lacune.test.ts`, `apps/web/e2e/specs/automations/jeu-lacune.spec.ts`.
- **Modifiés** : `packages/contracts/src/automations.ts`, `packages/contracts/src/review.ts`, `packages/automations/src/registry.ts`, `packages/services/src/review/build-session.ts`, composants du rail et de l'encadré du quiz global (SPEC-701), `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : banques (SPEC-513), `ensurePracticeExercise` (SPEC-613), `findCompatibleSlots` (SPEC-407).

## 10. Interface et conformité visuelle

- Mode `tokens` sur SCR-10 (`design/maquettes/QuizGlobal.dc.html`).
- Structure : rail `nav[aria-label="Jeux de la session"]` ; l'élément au format imposé contient `data-testid="global-quiz-rail-reason"` « Choisi pour votre oubli » (11 px, 700, `#8F3305`) ; encadré `section[aria-labelledby="t-pourquoi"]` (fond `#111113`, titre « Réglé par le tuteur » `#C6F432`) avec la ligne `data-testid="global-quiz-tuned-gap"` « Lacune en priorité : la variante d'exercice, oubliée depuis le 6 nov., revient en carte de rappel. ».
- Seed SPEC-115 : la session du 11 nov. impose `recall_card` à « Variante d'exercice » (lacune d'oubli du 6 nov.), 1er élément du rail « Carte de rappel · Variante d'exercice · Choisi pour votre oubli ».
- Contrôles : `expectTokens` (couleur de la raison, encadré), structure et textes, ligne de base `toHaveScreenshot('quiz-global-raison.png', { maxDiffPixelRatio: 0.01 })` avec horloge figée 2026-11-11T12:20:00Z.

## 11. Critères d'acceptation

- **CA-1** Une lacune d'oubli crée `game_chosen` (`recall_card`) et la prochaine session présente la notion en carte de rappel avec « Choisi pour votre oubli ».
- **CA-2** Une lacune de confusion impose une association ou un classement contenant les deux notions ; deux confrontations successives de la même paire alternent les deux formats.
- **CA-3** Une lacune de difficulté d'application crée un exercice et un créneau `exercise` à partir du lendemain, avec l'explication « Lacune « … » : exercice pratique placé {jour} {H:mm}. ».
- **CA-4** Avec la préférence `cards`, sur 1 000 tirages simulés sans format imposé, la part de cartes de rappel est entre 40 % et 60 % quand 5 formats sont disponibles (poids 3/7 ≈ 43 %) ; avec `vary`, aucun format ne dépasse 30 %.
- **CA-5** Une réponse jouée consomme l'action ; une lacune levée avant l'expire ; `undo` avant consommation rétablit le tirage par défaut.
- **CA-6** Désactivé ou en double déclenchement : aucun format imposé supplémentaire.
- **CA-7** L'écran du quiz global (seed) affiche la raison et la ligne « Lacune en priorité » conformes, sans violation axe serious/critical.

## 12. Plan de tests

- **Unitaires** (`describe('[SPEC-716] jeu selon la lacune …')`) : `chooseGapFormat` (tableau des natures, alternance) ; `weightedFormatPick` (fast-check : jamais le dernier format ; distributions CA-4) ; `explain` ; composant du rail (raison affichée, variantes de ton).
- **Intégration** (`[SPEC-716]`, base réelle, `gap/detected` exécuté directement) : oubli → session du lendemain (CA-1) ; confusion → brique de confrontation, absence → repli `choice_question` (CA-2, CL-9) ; application → exercice et créneau (CA-3) ; consommation, `gap/cleared`, undo (CA-5) ; désactivé, double événement, pause globale (CA-6) ; notification d'exercice en heures calmes.
- **End-to-end** (`apps/web/e2e/specs/automations/jeu-lacune.spec.ts`, seed, vidéo) : `test('raison du choix dans le quiz global @SPEC-716', …)` : ouvrir `/formations/<sap>/quiz-global`, vérifier la raison et l'encadré (CA-7), jouer la carte, ouvrir `/parametres#automatismes` et constater que la ligne du journal n'a plus de bouton « Annuler » (consommée). Axe.
- **Visuel** (`test('quiz global, raison du jeu @SPEC-716 @visual', …)`) : jetons, structure, ligne de base.
- **Non-régression** : `@SPEC-701`, `@SPEC-702`, `@SPEC-711`, `pnpm test:unit -t SPEC-406`.

| Critère | Tests |
|---|---|
| CA-1 | intégration « oubli » ; e2e |
| CA-2 | unitaire `chooseGapFormat` ; intégration « confusion » |
| CA-3 | intégration « application » |
| CA-4 | unitaire `weightedFormatPick` |
| CA-5 | intégration « consommation » ; e2e |
| CA-6 | intégration « cas limites » |
| CA-7 | e2e ; visuel `@visual` |

## 13. Preuves attendues

`evidence/SPEC-716/` : vidéo `video/jeu-lacune.webm`, captures `screenshots/rail-raison.png`, `screenshots/encadre-regle.png`, `screenshots/journal-jeu-consomme.png`, mesures de distribution de CA-4 consignées dans `summary.md`, rapports, `acceptance.md`.

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7) ; de plus : fonctions de choix pures et couvertes ≥ 80 % (paquet `learning-engine`) ; aucune route nouvelle ; champs ajoutés au contrat de session signalés.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0020 (fonctions pures), ADR-0024 (natures), ADR-0026 (banques propres), ADR-0047, ADR-0190, ADR-0193 (priorité des formats).
- Décisions : alternance association/classement par paire ; repli `choice_question` à distracteur ; incompréhension sans format imposé ; poids de préférence 3/1 ; tirage déterministe par graine `hash(userId, date)` ; exercice planifié à partir du lendemain.
- Hypothèses : SPEC-513 expose `requestConfrontationBrick` ou équivalent (sinon SPEC-716 l'ajoute en réutilisant la génération en lot) ; SPEC-613 expose `ensurePracticeExercise`. Champs de contrat ajoutés : `items[].reason`, `tuned`.
