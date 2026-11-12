# SPEC-407 — critères d’acceptation

Tous les critères sont vérifiés par les tests du paquet, le test d’intégration et les tests e2e de
la page `/_dev/sdd/SPEC-407`. Preuves générées dans `evidence/SPEC-407/`.

- ✅ **CA-1** Deux formations ne dépassent jamais ensemble les heures quotidiennes autorisées et
  aucune activité ne se chevauche. Preuves : `packages/learning-engine/src/planner/plan.test.ts`
  (`[SPEC-407] Planificateur`, capacité et chevauchements), `test/integration/planner.test.ts`
  (capacité cumulée), `e2e.json` (calendrier et capacité affichés) — `unit.json`,
  `integration.json`, `e2e.json`.
- ✅ **CA-2** Chaque module obtient une marge de 60 minutes après le quiz et chaque journée d’étude
  un quiz global de 30 minutes en fin de journée. Preuves :
  `packages/learning-engine/src/planner/plan.test.ts` (marges contiguës et quiz global dernier),
  `test/integration/planner.test.ts` (composition avec les dépendances) — `unit.json`,
  `integration.json`.
- ✅ **CA-3** Une replanification après pause ou séance manquée conserve les créneaux terminés et
  respecte le nouveau rythme. Preuves : `plan.test.ts` (pause, séance manquée et créneau futur
  distinct), `test/integration/planner.test.ts` (terminés, manqués et déplacement manuel
  conservés) — `unit.json`, `integration.json`.
- ✅ **CA-4** Une échéance impossible produit les trois options chiffrées ou marque l’option non
  réalisable, sans modifier le plan avant consentement. Preuves : `plan.test.ts` (trois options,
  volume impossible à 6 h, plan identique après calcul), `test/integration/planner.test.ts`
  (entrée non mutée) — `unit.json`, `integration.json`.
- ✅ **CA-5** La démonstration affiche le calendrier et les conflits, avec vidéo, axe et test
  `@visual`. Preuves : `apps/web/e2e/specs/p4/spec-407.spec.ts` (`@SPEC-407`, scénario séance
  manquée), `@visual` desktop et mobile, `@axe-core/playwright` sans violation
  serious/critical — `e2e.json`, `e2e.xml`, `video/`, `screenshots/`, `visual/`.
