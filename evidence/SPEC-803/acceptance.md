# SPEC-803 — critères d'acceptation

Campagne du 2026-11-17 sur la branche `spec/SPEC-803-accessibilite-wcag-2-2-aa`, recalée sur
`main` après SPEC-805 (CSP) et SPEC-806 (pied de page légal commun). Décision du porteur
(ADR-0334) : quatre tests sont reportés à SPEC-807 ; ils sont signalés ci-dessous et ne sont pas
comptés comme réussis.

- ✅ CA-1 — Audit axe `audit axe desktop @SPEC-803` et `audit axe mobile @SPEC-803 @mobile`
  (`apps/web/e2e/specs/p8/a11y-audit.spec.ts`) : 46 états de l'inventaire ET-1 audités en
  1440 × 900 et 46 en 390 × 844, 0 état bloquant, 0 violation serious/critical. Preuves :
  `evidence/SPEC-803/axe-report.json`, `axe-report-mobile.json` (avec `axe-before*.json`).
- ✅ CA-2 — **Accepté avec réserve (ADR-0334).** Le garde `forbidMouse` remplace chaque méthode de
  `page.mouse` par une erreur. Réussis au clavier seul : connexion, carte des notions, paramètres
  (onglets flèches/`Home`/`End`, interrupteur Espace, confirmation annoncée par la région live).
  Reportés à SPEC-807 (`test.fixme`, raison en commentaire) : quiz de validation, examen blanc,
  quiz global — défauts de mise en place des données de test, pas de non-conformité constatée ;
  ces trois parcours restent non vérifiés par un test automatisé tant que SPEC-807 ne les a pas
  réactivés.
- ✅ CA-3 — `noms accessibles des régions clés @SPEC-803` : 9 instantanés `toMatchAriaSnapshot`
  versionnés (en-tête, menu latéral, notifications, question du quiz, carte de rappel, palette de
  l'examen, détail de la carte, onglets des paramètres, formulaire de connexion), aucun bouton sans
  nom dans l'inventaire de l'audit axe. Preuves : `apps/web/e2e/__screenshots__/p8/
  aria-snapshots.spec.ts/*.aria.yml`, `e2e.json`.
- ✅ CA-4 — `packages/ui/src/tokens/contrast.test.ts` vérifie toutes les paires de `pairs.ts` aux
  ratios d'ET-4 (dont #62626B sur #F4F4F1 et #F8F8F6) et le contour de focus 2 px décalé de 2 px,
  contrasté sur clair et sombre ; `états de focus visibles des composants principaux @SPEC-803
  @visual` mesure `outline-width` 2 px et la couleur de focus sur bouton et champ. Le test
  `zoom 200 % et espacement du texte @SPEC-803` passe sans défilement horizontal ni contenu coupé.
- ✅ CA-5 — **Accepté avec réserve (ADR-0334).** `packages/ui/src/styles/accessibility.css`
  neutralise transitions et animations sous `prefers-reduced-motion: reduce` ; le test e2e
  `mouvement réduit @SPEC-803` (panneau tuteur, retournement de carte, carte des notions) est
  reporté à SPEC-807, la carte de rappel du quiz global n'étant pas atteignable de façon stable
  avec le jeu de démonstration partagé. La durée de transition à 0 ms n'est donc pas mesurée par
  un test e2e dans cette campagne.
- ✅ CA-6 — `docs/accessibility/wcag-2-2-grille.md` couvre les 55 critères A/AA (49 applicables,
  6 non applicables) ; `packages/testing/src/wcag22.test.ts` (catalogue, 4.1.1 retiré, 6 non
  applicables) et `wcag-grid.test.ts` (chaque critère « conforme » référence un test existant).
  Audit consigné dans `docs/accessibility/audit-v1.md` (2026-11-17).
- ✅ CA-7 — `apps/web/test/integration/public-routes.test.ts` : `/accessibilite` atteinte sans
  cookie (200), jamais redirigée vers `/connexion`. `déclaration d’accessibilité, jetons et
  structure @SPEC-803 @visual` et sa variante mobile : un seul h1, les sept sections d'EF-10
  (dont « Dérogations »), « [à compléter] » pour l'éditeur et le contact, quatre liens au pied de
  page dont « Accessibilité : partiellement conforme », présent aussi au pied de `/connexion`
  (pied de page commun de SPEC-806). La page est rendue à la requête pour recevoir le nonce CSP.
