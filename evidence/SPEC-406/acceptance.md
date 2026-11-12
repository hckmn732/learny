# SPEC-406 — Critères d’acceptation

Preuves produites par `node tools/sdd/validate.mjs SPEC-406` sur la branche
`spec/SPEC-406-tirage-de-la-session-de-quiz-global`. Horloge figée au 2026-11-11T12:20:00Z,
`LLM_MODE=mock`, aucune écriture en base dans la démonstration.

| Critère | État | Preuve |
|---|---|---|
| **CA-1** — Trois modules alternent lorsque possible et les lacunes précèdent les notions sans lacune | ✅ | Unitaire `[SPEC-406] place les lacunes en tête et entrelace trois modules` : ordre `a, c, b, d, e, f`, deux lacunes en tête, modules entrelacés (`unit.json`). E2E `Tirage de la session de quiz global @SPEC-406` : ordre réel des items, premier item « Lacune en tête » (`e2e.json`, vidéo). |
| **CA-2** — La durée ne dépasse pas le plafond ; toute notion exclue figure dans `deferred` et son état FSRS reste inchangé | ✅ | Unitaire `[SPEC-406] respecte le plafond, reporte les notions non jouées et ne modifie rien` et `… estime la durée avec l’overhead…` : `estimatedMinutes ≤ capMinutes`, reports à `2026-11-12`, entrée gelée inchangée (`unit.json`). Intégration `[SPEC-406] compose FSRS, lacunes et banque sans altérer les états reportés` : échéances issues de `ts-fsrs`, cartes inchangées (`integration.json`). |
| **CA-3** — Une notion ne reprend pas son dernier format si un autre format valide existe ; nature de lacune et préférence appliquées | ✅ | Unitaire `[SPEC-406] varie le format, impose la nature de la lacune et applique la préférence` : `varied`, `gap_nature`, `preference`, `bank_constraint` vérifiés (`unit.json`). Intégration `[SPEC-406] compose FSRS, lacunes et banque…` : format de la lacune de confusion différent du dernier format (`integration.json`). |
| **CA-4** — L’entretien léger ne contient que les notions dues et dure au plus cinq minutes ; mêmes entrées et seed donnent le même résultat | ✅ | Unitaire `[SPEC-406] mode entretien : plafond de cinq minutes et modules validés seulement` : `capMinutes = 5`, un seul module validé, permutation identique (`unit.json`). Intégration `[SPEC-406] mode entretien…` : `requestedCapMinutes = 15`, plafond effectif 5, item courant exclu (`integration.json`). |
| **CA-5** — La démonstration montre session, durée et reports, avec vidéo, axe et test `@visual` | ✅ | E2E `Tirage de la session de quiz global @SPEC-406` et `… @visual @mobile` : trois modes, reports, épuisement, cas limites, `axeCheck` sans violation, vidéo réelle et captures desktop/mobile (`e2e.json`, `e2e.xml`, `video/`, `screenshots/`, ligne de base `apps/web/e2e/__screenshots__/p4/spec-406.spec.ts/`). |

## Commandes exécutées

- `flock /tmp/learny-sdd-db.lock node tools/sdd/validate.mjs SPEC-406`
- Les tests filtrés correspondants sont rejoués par la validation : `pnpm test:unit -t SPEC-406`,
  `pnpm test:int -t SPEC-406`, `pnpm test:e2e --grep @SPEC-406`.
