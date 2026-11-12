# SPEC-402 — critères d'acceptation

Preuves réelles des tests déterministes (horloge figée `2026-11-11T12:20:00.000Z`, `LLM_MODE=mock`).
Les rapports `unit.json`, `integration.json`, `e2e.json` et `checks.json` sont copiés par
`node tools/sdd/validate.mjs SPEC-402` dans ce même dossier.

- ✅ CA-1 — `packages/learning-engine/src/fsrs/review.test.ts` : « note déduite de la justesse et du temps (CA-1) » couvre faux → Again, 9 s → Easy, 20 s → Good, 41 s → Hard et les bornes 10 s / 40 s → Good ; la table `grade-case-*` de `apps/web/e2e/specs/p4/spec-402.spec.ts` vérifie les six notes calculées. Preuve : `unit.json`, `e2e.json`, captures `evidence/SPEC-402/screenshots/`.
- ✅ CA-2 — Tests unitaires « médiane personnelle (CA-2) » : 0, négatifs, non finis et manquants ignorés, formats séparés, fenêtre de 50 réponses les plus récentes et défaut 20 s avant 5 réponses valides ; l'intégration `packages/learning-engine/test/integration/fsrs.test.ts` rejoue le même historique avec des réponses invalides. Preuve : `unit.json`, `integration.json`.
- ✅ CA-3 — Tests « carte et échéances (CA-3, CA-4) » : les quatre notes Raté/Difficile/Bon/Facile renvoient la note correspondante et leur échéance prévisualisée ; l'e2e clique « Bon » et vérifie l'échéance `PREVIEW.good` dans `recall-result`. Preuve : `unit.json`, `integration.json`, `e2e.json`, vidéo `evidence/SPEC-402/video/`.
- ✅ CA-4 — Tests « produit des échéances reproductibles pour 0,85, 0,90 et 0,95 (CA-4) » : trois rétentions, deux appels identiques, carte d'entrée non mutée ; la table `retention-85/90/95` de la démonstration affiche les mêmes quatre échéances. Preuve : `unit.json`, `integration.json`, `e2e.json`.
- ✅ CA-5 — `apps/web/e2e/specs/p4/spec-402.spec.ts` : test `@SPEC-402` filmé avec capture `spec-402-demo`, test `@visual @mobile` avec axe et `toHaveScreenshot` à 1 % pour desktop et mobile ; la démonstration affiche les quatre boutons et leurs quatre échéances. Preuve : `e2e.json`, `e2e.xml`, `video/`, `screenshots/`, `visual/`.
