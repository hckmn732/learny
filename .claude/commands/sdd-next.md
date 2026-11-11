---
description: Exécute une seule spécification SDD (la prochaine exécutable) de bout en bout
---

Lis `AGENTS.md`. Exécute `node tools/sdd/next.mjs --json`, puis traite **une seule** action (spécification ou checkpoint) selon `docs/engineering/sdd-process.md` §2, jusqu'à `complete.mjs` ou `checkpoint.mjs` réussi. Ne sollicite jamais l'utilisateur ; consigne toute décision dans un ADR. Termine par un résumé : spécification traitée, validations, preuves, commit de fusion.
