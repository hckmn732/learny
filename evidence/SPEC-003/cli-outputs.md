# Sorties observées — SPEC-003

Relevées le 2026-11-11 dans le conteneur de développement ; aucune donnée sensible.

## `pnpm -s sdd:next --json` (dépôt réel, pendant la validation)

```json
{"kind":"resume","id":"SPEC-003","title":"Outillage SDD exécutable et intégré","path":"specs/p0-fondations/SPEC-003-outillage-sdd-executable-et-integre.md","dependsOn":["SPEC-001"]}
```

## Refus de `complete` (référentiel temporaire, `integration.json` › « refuses complete when a video, a @visual test or a criterion is missing (CA-5) »)

```
✖ Validations non réussies : visual. Lancez node tools/sdd/validate.mjs SPEC-001.
✖ Validations non réussies : acceptance. Lancez node tools/sdd/validate.mjs SPEC-001.
✖ Aucune vidéo dans evidence/SPEC-001/video
```

L'état de la spécification reste `in_progress` après chacun de ces refus.
