# Audit d’accessibilité V1 — Learny

- **Date de l’audit** : 2026-11-17 (date du commit de ce document, reprise par la déclaration
  `/accessibilite`).
- **Référentiel** : WCAG 2.2, niveaux A et AA.
- **Méthode** : audit interne automatisé (axe-core 4.x via `@axe-core/playwright`) sur tous les
  états de l’inventaire, complété par six parcours clavier Playwright, des instantanés de l’arbre
  d’accessibilité et des contrôles de jetons (contrastes, focus, mouvement réduit). Aucun audit
  externe et aucun test avec un lecteur d’écran réel n’ont été réalisés dans cet environnement
  (limite déclarée sur `/accessibilite`).

## Inventaire audité

L’inventaire exhaustif étend la matrice responsive de SPEC-802
(`apps/web/e2e/support/responsive-matrix.ts`) avec les états dynamiques de SPEC-803 ET-1
(`apps/web/e2e/support/a11y-inventory.ts`) : dialogues ouverts (confirmation de soumission du
quiz, limite de trois formations, suppression du compte), toasts, erreurs de formulaire, panneau
du tuteur en cours de réponse et `/accessibilite`.

- **46 états** audités en desktop 1440 × 900 et en mobile 390 × 844.
- Balises axe : `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, plus les règles de
  meilleure pratique `region`, `landmark-one-main`, `page-has-heading-one`, `heading-order`.

## Résultats axe

| Passe | États | Violations sérieuses/critiques | Rapport |
|---|---|---|---|
| Avant corrections (desktop) | 46 | 0 (1 état non mesuré : panneau d’export inerte dans la séquence) | `evidence/SPEC-803/axe-before.json` |
| Avant corrections (mobile) | 46 | 0 (même état non mesuré) | `evidence/SPEC-803/axe-before-mobile.json` |
| Après corrections (desktop) | 46 | 0 | `evidence/SPEC-803/axe-report.json` |
| Après corrections (mobile) | 46 | 0 | `evidence/SPEC-803/axe-report-mobile.json` |

Aucune violation `moderate` ou `minor` n’est retenue après corrections : les quelques signaux
rencontrés lors de l’audit initial (attribut `lang` des contenus, régions nommées, titres) ont été
corrigés et sont couverts par les tests de la grille.

## Parcours clavier

Les six parcours d’EF-3 sont exécutés sans souris (garde de test sur `page.mouse`) :

1. connexion ;
2. quiz de validation ;
3. examen blanc ;
4. quiz global ;
5. carte des notions ;
6. paramètres.

Ils vont jusqu’à leur état final et sont enregistrés en vidéo (`evidence/SPEC-803/video/`).

## Non-conformités connues

Aucune non-conformité connue à la date de l’audit.

## Dérogations

- Contenus déposés par l’apprenant et contenus générés à partir de ses apports : contenus tiers.
- Vidéos YouTube intégrées comme liens, jamais comme lecteurs embarqués.
- Aucun test avec un lecteur d’écran réel ; les noms et rôles sont vérifiés par
  `toMatchAriaSnapshot` et `getByRole` (ET-7).

La grille critère par critère est tenue dans `docs/accessibility/wcag-2-2-grille.md`.
