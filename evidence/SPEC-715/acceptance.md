# SPEC-715 — critères d'acceptation

- ✅ CA-1 — Un quiz de validation échoué crée une action `remediation_ready` (activité de remédiation de 15 min, créneau `revision` et créneau de tentative ≥ `retryAvailableAt`) ; un quiz réussi n'en crée pas. Preuves : `packages/automations/test/integration/remediation.test.ts` → « CA-1 — un quiz échoué crée la remédiation… » et « CA-1 — un quiz réussi ne crée aucune action ».
- ✅ CA-2 — Pendant le délai, `POST /api/v1/modules/:mid/quiz/attempts` répond 422 `RETRY_NOT_YET_ALLOWED` avec `retryAvailableAt` ; après le délai, 201. Preuves : intégration « CA-2 — le délai refuse 422… puis autorise 201 » ; e2e `apps/web/e2e/specs/p7/automations/remediation.spec.ts` (réponse 422 attachée `retry-422`).
- ✅ CA-3 — En mode obligatoire, la tentative reste refusée (`remediationRequired: true`) jusqu'à `POST /modules/:mid/remediation/complete`. Preuves : intégration « CA-3 — le mode obligatoire refuse jusqu'à la fin de la remédiation » ; unitaires `retry-guard.test.ts` et `ResultActions.test.tsx`.
- ✅ CA-4 — L'écran de résultat affiche le bouton désactivé et « Nouvelle tentative possible mercredi 11 nov. à 14:00. » pendant le délai. Preuves : e2e « quiz raté : remédiation prête et tentative différée » (`screenshots/` `resultat-delai`), unitaire composant `ResultActions.test.tsx`.
- ✅ CA-5 — `undo` avant la tentative suivante lève le délai, annule le créneau de remédiation et restaure/supprime le créneau de tentative ; après la tentative suivante, l'annulation répond 422 `AUTOMATION_ACTION_CONSUMED`. Preuves : intégration « CA-5 — undo avant… » et « CA-5 — après la tentative suivante… » ; e2e (capture `resultat-apres-annulation`, journal `journal-remediation`).
- ✅ CA-6 — Désactivé : aucun délai ; double émission : une seule action ; IA indisponible : délai et créneau de tentative appliqués, explication adaptée ; pause globale : action créée sans créneau. Preuves : intégration « CA-6, CL-1 », « CA-6, CL-5 », « CA-6, CL-9 », « CA-6, CL-4 », « CL-2, CL-3 ».
- ✅ CA-7 — Les explications respectent EF-8 dans les deux tons ; contrôles de jetons et axe réussis. Preuves : unitaire `packages/automations/src/definitions/remediation.test.ts` (`[SPEC-715] remédiation · explication`) ; e2e visual `résultat avec délai, jetons @SPEC-715 @visual` (`expectTokens`, axe, capture `resultat-delai-visual`, mobile `resultat-delai-mobile`).

## Validations

- `unit` : tests `[SPEC-715]` des explications, de la garde et du composant de résultat.
- `integration` : base Postgres réelle, RLS, événement `quiz/graded`, horloge avancée, 422/201, mode obligatoire, undo/consommation, désactivation, déduplication, IA indisponible, pause, heures calmes et plafond.
- `e2e` : parcours Playwright avec vidéo `video/remediation.webm` et captures desktop/mobile.
- `visual` : jetons du résultat, axe, ligne de base `quiz-resultat-delai.png` (≤ 1 %).
