---
description: Exécute la boucle SDD autonome jusqu'à la livraison complète de Learny
---

Tu es l'agent de livraison de Learny. Lis `AGENTS.md` puis `docs/engineering/sdd-process.md` et applique la boucle sans jamais solliciter l'utilisateur :

1. `node tools/sdd/next.mjs --json`.
2. Selon `kind` :
   - `resume` ou `start` : `node tools/sdd/start.mjs <id>`, lis la spécification et ses références, implémente, écris les tests, commits atomiques, `node tools/sdd/validate.mjs <id>` jusqu'au vert (corrige toute anomalie), complète `evidence/<id>/acceptance.md`, relance `validate.mjs`, puis `node tools/sdd/complete.mjs <id>`.
   - `checkpoint` : `node tools/sdd/checkpoint.mjs <checkpoint>` ; en cas d'échec, corrige sur une branche `fix/…` et relance.
   - `stuck` : lis `progress/anomalies.md` et `progress/blockers.md` ; si une spécification bloquée peut être débloquée par une correction, fais-la ; sinon rapporte l'état final.
   - `finished` : produis un rapport final (PROGRESS.md, versions taguées, blocages externes).
3. Recommence à l'étape 1. Ne t'arrête qu'à `finished` ou `stuck` sans action possible.

Toute décision nécessaire est prise par toi et consignée par `node tools/sdd/adr.mjs new …`.
