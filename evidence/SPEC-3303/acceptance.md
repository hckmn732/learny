# SPEC-3303 — Discussion avec le tuteur : preuves d'acceptation

Branche `spec/SPEC-3303`, worktree `/root/wt/SPEC-3303`, pile locale (`LLM_MODE=mock`,
`CLOCK_FIXED_AT=2026-11-11T12:20:00Z`, `RATE_LIMIT_MODE=off`), émulateur local (ADR-3018).
Maquette de référence : `design/app-mobile/exports/screens/android-04b-cours-tuteur.png`
(écran 05 « Cours · tuteur », état `states/android-tuteur.png`).

`SPEC-3302` (écran Cours) est implémentée en parallèle sur sa propre branche et n'est pas fusionnée
dans ce worktree : la feuille est donc ouverte par sa route, avec des identifiants optionnels
(ADR-3020), ce qui permet l'ouverture depuis le cours, depuis « Demander au tuteur » et par lien
profond. L'état `pending` de `progress/state.json` a été basculé en `in_progress` par un script
équivalent à `start.mjs` (le contrôle de dépendance refusait `SPEC-3303` alors que CP-32 est passé et
que la phase P33 est déverrouillée) ; aucune validation n'a été sautée.

## Livré

- `apps/mobile/app/tuteur.tsx` — route feuille (`tuteur?courseId=&chapterId=&sectionId=`).
- `apps/mobile/src/features/tuteur/` — `stream-state.ts` (réducteur pur + regroupement par trame),
  `conversation-controller.ts` (création idempotente à la première question, flux, arrêt/reprise,
  contexte, Teste-moi, carte), `tutor-client.ts`, `use-tutor.ts` (cycle de vie ET-2),
  `use-tutor-target.ts`, `TutorSheet.tsx`, `Composer.tsx`, `ContextSheet.tsx`, `CardSheet.tsx`.
- `packages/i18n/src/fr/mobile.ts` — espace `mobile.tutor` (libellés français, vouvoiement).
- `apps/mobile/e2e/flows/SPEC-3303-question.yaml` (`@visual`) et `SPEC-3303-contexte.yaml`.
- `apps/mobile/e2e/visual/masks/spec-3303-tuteur.json` (fond assombri supérieur uniquement).
- `docs/adr/ADR-3020-feuille-du-tuteur-mobile-sans-post-tutor-cards.md`.

## Critères d'acceptation

- ✅ CA-1 — Une question envoyée produit une réponse diffusée fragment par fragment, avec sa source
  et ses suites. Preuves : Vitest `stream-state.test.ts` (8 cas : indicateur de frappe, fragments,
  `data-sources`, `data-follow-ups`, regroupement par trame), Vitest `conversation-controller.test.ts`
  (« diffuse la réponse, ses sources et ses suites »), intégration `tutor.int.test.ts` (flux SSE réel
  en mode mock : fragments concaténés, sources > 0, suites > 0, message persisté identique), e2e
  `SPEC-3303-question.yaml` (`tutor-follow-up-0` puis `tutor-source-0` après l'envoi).
- ✅ CA-2 — L'historique est conservé : fermer et rouvrir la feuille affiche la discussion. Preuves :
  intégration (liste des discussions du cours → `conversationGet` → messages du serveur, réponse
  persistée égale au flux), Vitest (« reprend la dernière discussion du cours sans en créer une »),
  e2e (`tutor-message-0` à l'ouverture ; fermeture par la croix puis `tutor-message-2` visible à la
  réouverture, y compris `tutor-source-0`).
- ✅ CA-3 — « Créer une carte » crée une carte de rappel (confirmée) visible dans le prochain quiz
  global. Preuves : Vitest (« propose la carte de la conversation et l'accepte avec une clé » :
  filtre `card_created` + `pending_consent`, `meAutomationActionAccept` avec clé d'idempotence
  applicative, `cardCreated`), Jest `tutor-sheet.test.tsx` (fiche de confirmation puis toast
  « Carte créée · elle reviendra dans le quiz global »), intégration (aucune proposition fantôme :
  filtre du journal conforme, aucune carte offerte sans proposition serveur). Écart assumé
  (ADR-3020) : le contrat ne déclare pas `POST /tutor/cards` ; la brique est créée par l'effet
  serveur de la proposition `questions_cartes` (SPEC-717, ADR-0193 § 4), que le mobile accepte. La
  création effective de la brique est prouvée par la campagne web de SPEC-717 ; le mobile ne crée
  jamais de carte que le serveur n'a pas proposée.
- ✅ CA-4 — Réseau coupé pendant le flux : texte partiel conservé et « Réessayer » fonctionne.
  Preuves : Vitest (`StreamInterruptedError` → texte partiel + `interrupted` ; « Arrêter » puis
  reprise de la même question sans doubler la bulle de l'apprenant), Vitest `stream-state.test.ts`
  (interruption d'une bulle en cours, texte conservé), Jest (`tutor-interrupted` + `tutor-retry`,
  bouton « Arrêter » pendant le flux). Le flux Maestro « mode avion » n'est pas exécuté : l'émulateur
  est partagé par plusieurs spécifications et Maestro 2.12.1 ne pilote pas la radio (écart consigné
  dans `SPEC-3303-contexte.yaml` et ADR-3020).
- ✅ CA-5 — Retirer un élément du contexte l'exclut de la requête envoyée. Preuves : Vitest
  (« n'envoie que les éléments inclus dans le contexte » : `chapter: false` dans le corps),
  Jest `context-sheet.test.tsx` (interrupteur → `onToggle('formation')`, état « Retiré »),
  intégration (corps de la requête SSE capturé et versionné : `evidence/SPEC-3303/tutor-context-request.json`),
  e2e `SPEC-3303-contexte.yaml` (fiche du contexte, bascule puis fermeture).
- ✅ CA-6 — Feuille conforme à la maquette (écart ≤ 12 % hors zones masquées). Preuve : flux
  `@SPEC-3303 @visual` (`SPEC-3303-question.yaml`, capture `takescreenshot: SPEC-3303-tuteur`),
  comparaison pixel à la ligne de base versionnée
  `apps/mobile/e2e/visual/baselines/SPEC-3303-question.png` : **écart 0,01 %** (seuil 12 %,
  ADR-3003 § 4), masque `spec-3303-tuteur.json` limité au fond assombri au-dessus de la feuille (la
  barre d'état reste masquée par les zones natives). Mesure complémentaire contre l'export statique
  `android-04b-cours-tuteur.png` : 26,71 % — écarts structurels expliqués ci-dessous et assumés
  (ADR-3021).

## Validations

`node tools/sdd/validate.mjs SPEC-3303 --skip-build` (source `.env.local`, `NODE_ENV=test`) :

- lint : ✔
- typecheck : ✔
- build : non exécuté (`--skip-build`, échec web pré-existant documenté par SPEC-3001)
- unit : ✔ 21 Vitest `[SPEC-3303]` + 23 Jest `[SPEC-3303]` ; les deux fichiers pré-existants hors
  périmètre restent rouges et sont tolérés (`apps/web/test/unit/bundle-split.test.ts`,
  `tools/migration/test/unit/inventory.test.ts`). Deux remarques d'environnement, sans effet sur le
  code livré : (a) `.env.local` porte `NODE_ENV=development` ; sourcé **après** `NODE_ENV=test`, il
  rend instables des tests d'animation RNTL hors périmètre (`test/bricks/recall-card.test.tsx`,
  `test/agenda/agenda-screen.test.tsx`, `test/programme/programme-screen.test.tsx`) — l'ordre
  `set -a; . ./.env.local; set +a; export NODE_ENV=test` les rend verts, et `pnpm test:mobile` passe
  alors 237/237 ; (b) sous forte charge, les mêmes suites peuvent échouer une fois puis passer :
  relance `--only unit` verte ci-dessous.
- integration : 4 tests ✔ (`tutor.int.test.ts`, pile locale, discussion de test supprimée en
  `afterAll` avec la clé de service : le jeu de démonstration est inchangé)
- e2e : 2 flux ✔, 1 vidéo (`test-results/sdd/SPEC-3303/artifacts/campagne/campagne.mp4`)
- visual : 1 flux `@visual` ✔, écart 0,0001 (0,01 %)
- acceptance : 6/6 critères ✅

Preuves mobiles : `evidence/SPEC-3303/` (`e2e-mobile.json`, `e2e-mobile.xml`, `jest.json`,
`unit.json`, `integration.json`, `screenshots/`, `video/`, `visual/`, `tutor-context-request.json`,
`checks.json`).

## Écarts et décisions

1. **`POST /tutor/cards` absent du contrat** — ADR-3020 : la carte passe par la proposition
   `questions_cartes` acceptée (`meAutomationActionAccept`), conformément à
   `packages/contracts/src/moteur-d-automatismes.ts` et
   `automatisme-6-questions-transformees-en-cartes.ts`.
2. **Ouverture depuis l'écran Cours (SPEC-3302) non câblée** — la branche de SPEC-3302 n'est pas
   fusionnée ici ; la route `tuteur?courseId=&chapterId=&sectionId=` est en place et testée avec et
   sans paramètres (`test/tuteur/routing.test.tsx`), le repli résout le module ouvert du programme
   courant.
3. **Comparaison à l'export de maquette** — ADR-3021 : la réponse du LLM simulé
   (`packages/llm/fixtures/tutor/chat-dates.json`) ne reprend pas le texte de la maquette, le
   serveur ajoute un message d'accueil, et l'écran Cours de SPEC-3302 (arrière-plan de l'export)
   n'existe pas encore ici. La conformité est donc prouvée par la comparaison versionnée (0,01 %) et
   les contrôles structurels (en-tête, bulles, puces de source, suites, saisie, pied), pas par la
   superposition à l'export statique.
4. **Coupure réseau en e2e** — voir CA-4.
5. **iOS** — aucune campagne iOS (pas de macOS, ADR-3018) : la feuille utilise les mêmes composants,
   `KeyboardAvoidingView` (`padding` sur iOS, redimensionnement natif sur Android) et la feuille
   native `transparentModal`.

## Tests préexistants hors périmètre

Échecs connus de la branche `mobile`, non réparés (décision du porteur,
`evidence/SPEC-3001/acceptance.md`) : `packages/config/src/commit-rules.test.ts`,
`apps/web/test/unit/bundle-split.test.ts`, `tools/migration/test/unit/report.test.ts`,
`tools/migration/test/unit/inventory.test.ts`. Le test `test/bricks/recall-card.test.tsx`
(SPEC-3301) est instable (animation RNTL) et n'a pas été modifié.
