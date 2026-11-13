# SPEC-513 — critères d'acceptation

- ✅ CA-1 — `packages/services/src/questions/prepare-bank.test.ts` vérifie quatre variantes valides aux empreintes distinctes ; l’intégration `packages/services/test/integration/question-bank.test.ts` persiste quatre variantes et le test e2e affiche quatre empreintes masquées distinctes.
- ✅ CA-2 — l’intégration prouve qu’un second apprenant ne peut ni lire ni préparer la banque du premier (`COURSE_NOT_READY`, zéro brique visible) ; la démonstration rappelle que la banque est propre au propriétaire.
- ✅ CA-3 — l’intégration déclenche `reason: exhaustion` après quatre variantes vues : quatre nouvelles empreintes sont insérées, aucune ancienne n’est réutilisée ; le test e2e montre l’état épuisé puis la régénération à zéro empreinte réutilisée.
- ✅ CA-4 — l’intégration lance deux préparations concurrentes et vérifie quatre briques, quatre empreintes distinctes ; `prepare-bank.test.ts` refuse une brique invalide (distracteur sans notion) avant insertion.
- ✅ CA-5 — `apps/web/e2e/specs/p5/spec-513.spec.ts` filme la démonstration (variantes, empreintes masquées, épuisement), exécute axe et le test `@visual` desktop/mobile avec captures de référence ; les vidéos et captures sont collectées dans `evidence/SPEC-513/`.
