# Checkpoint CP-35 — Mobile — notifications push et publication (exige CP-23)

- Date : 2026-11-24T14:14:19.273Z
- Résultat : ✅ réussi
- Spécifications de la phase : SPEC-3501, SPEC-3502

| Contrôle | Commande | Résultat |
|---|---|---|
| audit | `node tools/sdd/audit.mjs` | ✅ |
| lint | `pnpm -s lint` | ✅ |
| typecheck | `pnpm -s typecheck` | ✅ |
| build (hors web, pré-existant cassé) | `pnpm -s build --filter=!@learny/web` | ✅ |
| unit+coverage | `pnpm -s test:unit --coverage --exclude 'apps/web/test/unit/bundle-split.test.ts' --exclude 'tools/migration/test/unit/inventory.test.ts'` | ✅ |
| integration (client mobile) | `sh -c 'set -a; . ./.env.local; set +a; NODE_ENV=test pnpm -s test:int apps/mobile/test/integration'` | ✅ |
| e2e mobile (preuves de campagne) | `node tools/sdd/mobile-evidence.mjs SPEC-3501 SPEC-3502` | ✅ |

Critères fonctionnels : voir specs/checkpoints.md (CP-35).
