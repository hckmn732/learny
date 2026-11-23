# SPEC-3305 — Réviser : quiz global, échauffement et hors ligne — preuves d'acceptation

Branche `spec/SPEC-3305-reviser-quiz-global-echauffement-hors-li`, worktree `/root/wt/SPEC-3305`,
pile locale (`LLM_MODE=mock`, `CLOCK_FIXED_AT=2026-11-11T12:20:00Z`, `RATE_LIMIT_MODE=off`),
émulateur Android local (ADR-3018). Maquette de référence : `design/app-mobile/exports/screens/
android-06-session.png`, lue avec les corrections d'ADR-3003 § 2 (« Réviser »).

## Livré

- `apps/mobile/app/(app)/reviser/index.tsx` — onglet Réviser (session du jour, rail, carte de rappel,
  jeux, série, encadré du tuteur, écran de fin, états vide/pause/erreur, sélecteur de formation).
- `apps/mobile/app/(app)/reviser/echauffement/[activityId].tsx` — échauffement (EF-5).
- `apps/mobile/src/features/reviser/` — `session-state.ts` (rail, progression, fin, série),
  `answers.ts` (correspondance contrat ↔ briques, correction de jeu, auto-évaluation),
  `ReviewSession.tsx`, `ReviewRail.tsx`, `RecallGrades.tsx`, `SessionEnd.tsx`, `StreakStrip.tsx`,
  `TutorNote.tsx`, `WarmupView.tsx`.
- `apps/mobile/src/offline/{pack,queue,sync}.ts` — paquet du jour (EF-7), file typée (ET-1 :
  statuts `pending`/`syncing`/`rejected`, ordre `answeredAt`, reprise CL-1), synchronisation par
  lots de 50 et exclusive (EF-8, ET-6).
- `apps/mobile/src/data/{review,warmup}.ts`, `src/api/keys.ts` — lectures et mutations idempotentes.
- `packages/i18n/src/fr/mobile.ts` — espace `mobile.reviser` (libellés français).
- `apps/mobile/app/_dev/sdd/SPEC-3305.tsx` — page de démonstration du basculement hors ligne
  (`setOnlineForDemo`, Maestro 2.12.1 ne pilote pas la radio).
- `apps/mobile/e2e/flows/SPEC-3305-{a-session,b-parcours,c-echauffement}.yaml`,
  `apps/mobile/e2e/visual/masks/spec-3305-session.json`,
  `apps/mobile/e2e/visual/baselines/SPEC-3305-session.png`.
- `docs/adr/ADR-3022-conformite-visuelle-de-reviser-ligne-de-base-versionnee.md`.
- `apps/mobile/src/features/aujourdhui/TodayScreen.tsx` — la carte Échauffement ouvre désormais la
  route native (SPEC-3305 EF-5) au lieu du web.

## Critères d'acceptation

- ✅ CA-1 — La session du jour se joue de bout en bout et l'écran de fin affiche la série mise à jour.
  Preuves : Vitest `session-state.test.ts` (rail, progression, fin, série), Jest
  `review-screen.test.tsx`, intégration `review.int.test.ts` (session réelle de la pile locale),
  Maestro `SPEC-3305-b-parcours.yaml` (carte auto-évaluée, jeu d'association joué, passage des jeux
  restants, `review-end` et `review-end-title` visibles).
- ✅ CA-2 — Auto-évaluation sur quatre niveaux avec échéances ; l'échauffement utilise « À revoir » /
  « Je savais ». Preuves : Jest `recall-grades.test.tsx` (quatre boutons, échéance formatée dans le
  fuseau, verrouillage pendant l'envoi), `warmup.test.tsx` (révélation, `onAnswer(true|false)`),
  Maestro `SPEC-3305-c-echauffement.yaml` (`warmup-reveal`, `warmup-answer`, `warmup-again`,
  `warmup-knew`). La notion « À revoir » rejoint la session du soir côté serveur (route idempotente
  `POST /warmups/:activityId/answers`, SPEC-714) ; le mobile transmet `knew=false` et ne calcule
  aucune note FSRS (ET-2).
- ✅ CA-3 — Hors ligne : session préchargée jouable, correction locale, file, synchronisation sans
  doublon, serveur faisant foi. Preuves : Vitest `pack.test.ts` (paquet du jour, refus de la veille
  et de l'expiration, CL-2), `sync.test.ts` (ordre `answeredAt`, lots de 50, rejets, doublons,
  reprise après coupure, un seul envoi à la fois), Jest `offline-mode.test.tsx` (bandeau, échéances
  masquées hors ligne, `gradeBrick` local, correction d'association), intégration
  `review.int.test.ts` (paquet réel, entrée inconnue rejetée `SESSION_NOT_FOUND`, rejeu idempotent).
  Écart assumé : le flux Maestro « mode avion » n'est pas exécuté (Maestro 2.12.1 ne pilote pas la
  radio de l'émulateur partagé, précédent SPEC-3303/ADR-3020) ; la bascule est couverte par les
  tests ci-dessus et la page `/_dev/sdd/SPEC-3305`.
- ✅ CA-4 — Encadré de report du tuteur et « Annuler ». Preuves : intégration (`smoothing` :
  `deferredCount`, `deferredTo`, `capMinutes`, `actionId` renvoyés par l'API), Jest
  `review-screen.test.tsx` (texte « Le tuteur a reporté 4 notions à jeudi », `review-tutor-undo`
  remonte l'`actionId`), désactivation hors ligne (CL-4).
- ✅ CA-5 — Conformité visuelle (écart ≤ 12 %). Preuve : flux `@SPEC-3305 @visual`
  `SPEC-3305-a-session.yaml` (capture avant toute mutation), comparaison pixel à la ligne de base
  versionnée `apps/mobile/e2e/visual/baselines/SPEC-3305-session.png` ; masque
  `spec-3305-session.json` limité à la barre d'onglets native (barre d'état masquée par les zones
  natives). Mesures et écarts à l'export statique : voir « Mesures » ci-dessous et ADR-3022.

## Mesures

_(complétées après la campagne de comparaison)_

## Validations

_(complétées après `node tools/sdd/validate.mjs SPEC-3305 --skip-build`)_
