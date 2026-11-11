# Preuves de validation

Produites automatiquement par `node tools/sdd/validate.mjs SPEC-xxx` (via `tools/sdd/evidence.mjs`) et commitées par `complete.mjs`. Ne jamais les écrire ni les modifier à la main, sauf `acceptance.md` où l'agent coche chaque critère avec sa preuve.

```
evidence/SPEC-xxx/
  summary.md        date, commit, résultat de chaque validation, empreintes SHA-256
  acceptance.md     critère CA-n : ✅/❌ + preuve (test, capture, mesure)
  checks.json       résultats bruts des validations (lint, typecheck, build, unit, integration, e2e, visual, acceptance)
  unit.json         rapport Vitest filtré [SPEC-xxx]
  integration.json  rapport Vitest d'intégration filtré [SPEC-xxx]
  e2e.json, e2e.xml rapports Playwright filtrés @SPEC-xxx
  video/*.webm      vidéos des tests e2e (Git LFS, ADR-0050)
  screenshots/      captures des tests e2e
  visual/           captures et différences des tests @visual
evidence/checkpoints/CP-n/summary.md   rapport de checkpoint
```

Détails : `docs/engineering/testing.md` §5.
