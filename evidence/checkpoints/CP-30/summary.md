# Checkpoint CP-30 — Mobile — socle Expo, design system natif et données

- Date : 2026-11-22T22:55:34.516Z
- Résultat : ✅ réussi
- Spécifications de la phase : SPEC-3001, SPEC-3002, SPEC-3003

| Contrôle | Commande | Résultat |
|---|---|---|
| audit | `node tools/sdd/audit.mjs` | ✅ |
| lint | `pnpm -s lint` | ✅ |
| typecheck | `pnpm -s typecheck` | ✅ |
| build (hors web, pré-existant cassé) | `pnpm -s build --filter=!@learny/web` | ✅ |
| unit+coverage | `pnpm -s test:unit --coverage` | ✅ |
| integration (client mobile) | `pnpm -s test:int apps/mobile/test/integration` | ✅ |
| e2e mobile (preuves de campagne) | `node tools/sdd/mobile-evidence.mjs SPEC-3001 SPEC-3002 SPEC-3003` | ✅ |

Critères fonctionnels : voir specs/checkpoints.md (CP-30).
