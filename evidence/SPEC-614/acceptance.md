# SPEC-614 — Examen blanc : critères d’acceptation

Date de validation : 2026-11-13 · Branche `spec/SPEC-614-examen-blanc` · Horloge figée
2026-11-11T12:20:00Z · IA `LLM_MODE=mock`.

## CA-1 — Format par défaut et confirmation du guide ✅

- **Preuve unitaire** : `packages/services/src/mock-exams/timer.test.ts`, test
  « CA-1 — sans guide, l’examen dure 40 minutes avec 20 questions et un seuil de 70 % » :
  `defaultExamFormat()` renvoie 20 questions, 120 s/question, 40 min, seuil 70, source `default`.
- **Preuve d’intégration** : `packages/services/test/integration/mock-exam.test.ts`,
  « CA-1 — sans guide… » vérifie 20 questions, 40 minutes, 70 %, 12 questions étudiées et
  8 questions diagnostiques ; « CA-1 — un guide non confirmé ne lance aucune épreuve » vérifie
  `FORMAT_NOT_CONFIRMED` avant `confirmExamFormat`, puis le démarrage après confirmation.
- **Preuve e2e** : `apps/web/e2e/specs/p6/mock-exam.spec.ts`, scénario
  « examen blanc sans aide @SPEC-614 » : l’introduction affiche `20`, `40 min`, `70 %`.
- Rapport : `unit.json`, `integration.json`, `e2e.json` de ce dossier.

## CA-2 — Compteur orange et soumission automatique unique ✅

- **Preuve unitaire** : `timer.test.ts`, « CA-2 — le compteur devient orange strictement sous
  5 minutes » (300 s → normal, 299 s → orange) et « ADR-0172 — une réponse est acceptée jusqu’à
  cinq secondes après l’échéance ».
- **Preuve d’intégration** : « CA-2 — une tentative expirée est soumise automatiquement et une
  seule fois » : la lecture d’une tentative `in_progress` dont `deadline_at` est dépassée produit
  un statut `graded`, un seul événement `exam/submitted`, `timedOut = true`.
- **Preuve e2e** : scénario « expiration et revue @SPEC-614 » : après l’échéance serveur,
  l’écran affiche les résultats et « Temps écoulé : 40 min » ; un rechargement ne crée pas de
  second résultat.
- Vidéo : `video/mock-exam-expiration.webm` (e2e avec vidéo Playwright).

## CA-3 — Scores étudiés/diagnostic séparés et lacunes limitées ✅

- **Preuve unitaire** : `packages/services/src/mock-exams/grade.test.ts` :
  score étudié 100 % / diagnostic 0 % / global 50 % ; les erreurs diagnostiques ne créent pas de
  lacune, seules les erreurs étudiées alimentent `gaps` et le plan.
- **Preuve d’intégration** : « CA-3 — score étudié séparé du diagnostic et lacunes limitées aux
  modules étudiés » : 12/12 étudiés, 0/8 diagnostiques, score global 60 %, `gaps = []`, et zéro
  `gap_events` sur les modules de position > 3.
- **Preuve e2e** : « expiration et revue @SPEC-614 » : `100 %` étudié, `0 %` diagnostic,
  filtre « Erreurs seulement » → 8 lignes, toutes sur les modules diagnostiques.
- Rapport : `integration.json`, `e2e.json`.

## CA-4 — RLS, idempotence et validation ✅

- **Preuve d’intégration** : « CA-2, CA-4 — reprise, marqueur, double soumission unique et RLS » :
  deux `submitExam` concurrents renvoient un seul résultat et un seul événement
  `exam/submitted` ; un second utilisateur reçoit `NOT_FOUND` (404) sur la tentative du premier ;
  `saveExamAnswer` invalide est refusé par le schéma de réponse de la brique (aucune écriture).
- `CL-1`, `CL-2`, `CL-3`, `CL-4` couverts par les verrous consultatifs, la validation Zod et les
  tests ci-dessus.
- Rapport : `integration.json`.

## CA-5 — Conformité visuelle, axe et vidéo ✅

- **Preuve e2e visuelle** : `conformité SPEC-614 @SPEC-614 @visual` : comparaison de l’introduction
  avec `design/references/SCR-11-base-desktop.png` et de l’épreuve avec
  `SCR-11-examen-desktop.png`, écart ≤ 12 % (`MOCKUP_MAX_DIFF_RATIO`) ; captures de non-régression
  `SCR-11-introduction.png`, `SCR-11-epreuve.png`, `SCR-11-resultat.png` (≤ 1 %).
- **Mobile** : `conformité SPEC-614 mobile @SPEC-614 @visual @mobile` à 390 × 844, ligne de base
  `SCR-11-epreuve-mobile.png`.
- **Axe** : `axeCheck()` sur l’introduction, l’épreuve et les résultats ; aucune violation
  serious/critical.
- **Vidéo** : au moins une vidéo Playwright réelle dans `video/` (scénarios `@SPEC-614`).
- Liens : `visual/SCR-11-introduction-side-by-side.png`, `visual/SCR-11-epreuve-side-by-side.png`,
  `screenshots/`.

## Non-régression

- `[SPEC-611]` et `[SPEC-407]` rejoués par les suites unitaires/intégration complètes ; e2e
  `@SPEC-611` et `@SPEC-407` inchangés. Le filtre diagnostique ajouté à
  `applyLearningResult` est neutre quand `activities.config.diagnosticPositions` est absent.
