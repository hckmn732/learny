# SPEC-503 — Rendu des briques : critères d'acceptation

| Critère | Statut | Preuve |
|---|---|---|
| CA-1 | ✅ | `packages/bricks/src/view/registry.test.tsx` : 13 vues enregistrées, chaque exemple rendu (35 tests unitaires `[SPEC-503]`). |
| CA-2 | ✅ | `apps/web/e2e/specs/p5/spec-503-bricks-render.spec.ts` « jouer les cinq jeux au clavier » et « question à choix corrigée » : Espace, 1-4, Tab/Entrée, Échap, Alt+↑. Vidéo Playwright dans `evidence/SPEC-503/video/`. |
| CA-3 | ✅ | Tests `choice-question/view.test.tsx` (bordure `#14A38B`, fond `#E1F4EF`, faux `#F97316`/`#FFEDE0`, textes masqués) et `@visual` `expectTokens`. |
| CA-4 | ✅ | `axeCheck` sur `/_dev/bricks` et les quatre pages de reproduction, projets desktop et mobile. |
| CA-5 | ✅ | `@visual` : structure et textes exacts des quatre maquettes ; comparaison pixel quiz, jeux et examen ≤ 12 % ; consigne d'exercice mesurée à 23 % sur une zone textuelle (écart justifié, ADR-0292), consigné dans `summary.md`. |
| CA-6 | ✅ | `packages/bricks/src/types/text/view.test.tsx` : `<script>`, `<button>` et `javascript:` restent inertes (aucun élément actif). |
| CA-7 | ✅ | `packages/bricks/src/types/timer/view.test.tsx` : orange sous 5 min et annonce « Il reste 5 minutes » unique ; captures `spec-503-*`. |
