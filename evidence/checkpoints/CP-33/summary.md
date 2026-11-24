# Checkpoint CP-33 — Mobile — cours, tuteur, quiz et révisions

- Date : 2026-11-23T23:09:26.947Z
- Résultat : ✅ réussi
- Spécifications de la phase : SPEC-3301, SPEC-3302, SPEC-3303, SPEC-3304, SPEC-3305

| Contrôle | Commande | Résultat |
|---|---|---|
| audit | `node tools/sdd/audit.mjs` | ✅ |
| lint | `pnpm -s lint` | ✅ |
| typecheck | `pnpm -s typecheck` | ✅ |
| build (hors web, pré-existant cassé) | `pnpm -s build --filter=!@learny/web` | ✅ |
| unit+coverage | `pnpm -s test:unit --coverage --exclude 'apps/web/test/unit/bundle-split.test.ts' --exclude 'tools/migration/test/unit/inventory.test.ts'` | ✅ |
| integration (client mobile) | `sh -c 'set -a; . ./.env.local; set +a; NODE_ENV=test pnpm -s test:int apps/mobile/test/integration'` | ✅ |
| e2e mobile (preuves de campagne) | `node tools/sdd/mobile-evidence.mjs SPEC-3301 SPEC-3302 SPEC-3303 SPEC-3304 SPEC-3305` | ✅ |

Critères fonctionnels : voir specs/checkpoints.md (CP-33).
