# SPEC-717 — critères d'acceptation

Preuves produites par `node tools/sdd/validate.mjs SPEC-717` (rapports `unit.json`,
`integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, vidéos et captures réelles).

- ✅ CA-1 — Avec le réglage par défaut (`confirm`), une question produit une action
  `pending_consent` et aucune carte de quiz avant acceptation ; l'acceptation crée exactement une
  carte. Preuves : `packages/automations/src/definitions/questions-cartes.test.ts`
  (`[SPEC-717] CA-1`), `packages/services/src/spec-717.test.ts` (`CA-1`),
  `packages/automations/test/integration/questions-cartes.test.ts` (`CA-1` — action en attente,
  zéro brique, puis une brique `recall_card` après acceptation) et
  `apps/web/e2e/specs/p7/spec-717.spec.ts` (`parcours SPEC-717 @SPEC-717`, bandeau puis carte
  « Le tuteur a agi pour vous »).
- ✅ CA-2 — En mode automatique, la carte validée entre au prochain quiz
  (`notion_states.in_review = true`, `due_at` = début du jour local J+2) et une livraison répétée
  n'en crée pas de deuxième. Preuves : `[SPEC-717] CA-2` unitaire,
  `packages/services/test/integration/spec-717.test.ts` (raison `question_card` / « Votre
  question » dans la session du quiz global), `packages/automations/test/integration/questions-cartes.test.ts`
  (`CA-2` — une action appliquée, un rejeu sans écriture ni second événement) et le parcours e2e
  (mode automatique, deuxième carte, rejeu neutre).
- ✅ CA-3 — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes
  identiques ne dupliquent ni écriture ni événement ; une requête invalide ou une réponse non
  vérifiée ne crée rien. Preuves : `packages/automations/test/integration/questions-cartes.test.ts`
  (`CA-3` : `NOT_FOUND`, `CONFLICT`, double envoi, `event_outbox` unique ; `CL-3` : réponse
  absente, notion absente, source signalée) et `packages/services/test/integration/spec-717.test.ts`.
- ✅ CA-4 — La démonstration suit les jetons et la structure prescrits ; axe ne signale aucune
  violation serious/critical ; les captures desktop/mobile restent ≤ 1 % sur leurs lignes de base
  et la vidéo e2e est conservée. Preuves : `apps/web/e2e/specs/p7/spec-717.spec.ts`
  (`conformité SPEC-717 @SPEC-717 @visual`, `expectTokens`, `axeCheck`,
  `toHaveScreenshot` desktop 1440 × 900 et mobile 390 × 844), captures `spec-717-carte-desktop-linux.png`
  et `spec-717-carte-mobile-desktop-linux.png`, vidéos Playwright dans `evidence/SPEC-717/video/`.
