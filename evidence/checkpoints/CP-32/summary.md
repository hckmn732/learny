# Checkpoint CP-32 — Mobile — Aujourd’hui, Programme et Agenda

- Date : 2026-11-23T17:20:01.353Z
- Résultat : ✅ réussi
- Spécifications de la phase : SPEC-3201, SPEC-3202, SPEC-3203

| Contrôle | Commande | Résultat |
|---|---|---|
| audit | `node tools/sdd/audit.mjs` | ✅ |
| lint | `pnpm -s lint` | ✅ |
| typecheck | `pnpm -s typecheck` | ✅ |
| build (hors web, pré-existant cassé) | `pnpm -s build --filter=!@learny/web` | ✅ |
| unit+coverage | `pnpm -s test:unit --coverage` | ✅ |
| integration (client mobile) | `sh -c 'set -a; . ./.env.local; set +a; NODE_ENV=test pnpm -s test:int apps/mobile/test/integration'` | ✅ |
| e2e mobile (preuves de campagne) | `node tools/sdd/mobile-evidence.mjs SPEC-3201 SPEC-3202 SPEC-3203` | ✅ |

Critères fonctionnels : voir specs/checkpoints.md (CP-32).
