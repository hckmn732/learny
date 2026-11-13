# SPEC-604 — critères d'acceptation

- ✅ CA-1 — création `formations` (`status = 'cadrage'`, titre, sigle `SA`, couleur `indigo`) et question 1 : `packages/services/test/integration/cadrage.test.ts` (CA-1), e2e `@SPEC-604` « cadrage complet ».
- ✅ CA-2 — textes et états du panneau conformes à la maquette (q1→q3, 3/5, « Question 3 sur 5 au plus ») : e2e `@SPEC-604 @visual`, comparaison consignée selon ADR-0309.
- ✅ CA-3 — aperçu de sélection multiple avant envoi puis réponse « Utilisateur autonome, Certification SAP » : `FormationProfilePanel.test.tsx`, e2e « cadrage complet », intégration scénario SAP.
- ✅ CA-4 — plafond de cinq questions et conclusion forcée : `apply-tutor-turn.test.ts`, intégration « sixième question » (5/5).
- ✅ CA-5 — génération désactivée puis active, `422 CADRAGE_INCOMPLETE`, un seul événement, redirection programme : `FormationProfilePanel.test.tsx`, intégration `complete`, e2e « cadrage complet ».
- ✅ CA-6 — objectifs `operational` + `exam` et repli `['operational']` : intégration scénario SAP et `complete` incomplet.
- ✅ CA-7 — messages exacts `AI_UNAVAILABLE` / `AI_TASK_FAILED`, « Réessayer » : e2e « erreurs du tuteur », intégration `invalid`.
- ✅ CA-8 — reprise de l'historique, du profil et des suggestions, axe serious/critical : e2e « cadrage interrompu puis repris », `axeCheck` sur chaque test.
