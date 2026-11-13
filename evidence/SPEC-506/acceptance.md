# SPEC-506 — Qualification des modèles personnels

## Critères d'acceptation

- **CA-1** ✅ — `packages/llm/src/qualification/run.test.ts` (« CA-1 ») et `packages/services/test/integration/qualify-model.test.ts` (« CA-1, CA-2 ») : la fixture complète qualifie après connexion, appel d'outil, sortie structurée et treize briques valides ; le rapport contient quatre étapes et treize résultats détaillés. Preuves : `unit.json`, `integration.json`, e2e `spec-506-success`.
- **CA-2** ✅ — `run.test.ts` (« CA-2, CL-3 ») et `qualify-model.test.ts` (« CA-1, CA-2 ») : une seule brique invalide produit `failed`, conserve les douze autres résultats et `assignTaskModel` répond `AI_MODEL_NOT_QUALIFIED` ; `resolveModel` refuse ensuite le modèle. Preuve : `integration.json`, capture `spec-506-invalid`.
- **CA-3** ✅ — `apps/web/test/integration/ai-qualify-route.test.ts` : la route refuse la clé d'un autre utilisateur (404 `CREDENTIAL_NOT_FOUND`) et ne renvoie aucune clé, aucun chiffré ni `apiKey` ; `qualify-model.test.ts` vérifie la RLS et l'absence d'octet de clé dans l'erreur. Preuve : `integration.json`, `e2e.json`.
- **CA-4** ✅ — `qualify-model.test.ts` (« CA-4 ») : après deux corrections, `stopAfterInvalidBrick` renvoie `INVALID_OUTPUT`, crée la notification `ai_task_failed`, propose les choix et ne réalise aucun appel à l'IA fournie (`managedCalls: 0`, zéro ligne `ai_calls`). Preuve : `integration.json`.
- **CA-5** ✅ — `apps/web/e2e/specs/p5/spec-506.spec.ts` : scénario succès puis échec simulé dans la démonstration, vidéo Playwright, axe sans violation serious/critical et test `@visual` desktop/mobile à 1 %. Preuve : `e2e.json`, `e2e.xml`, `video/`, `screenshots/`, `visual/`.

## Non-régression

Les étiquettes `[SPEC-505]`, `[SPEC-501]`, `@SPEC-505` et `@SPEC-501` sont rejouées par la validation
complète. Aucune clé ni donnée privée n'apparaît dans les preuves ; aucun fournisseur réel n'est
appelé (`LLM_MODE=mock`, horloge figée au 2026-11-11T12:20:00Z).
