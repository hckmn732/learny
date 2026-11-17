# Grille de conformité WCAG 2.2 niveau AA — Learny V1

Audit interne automatisé (axe-core, Playwright) et parcours clavier, sans audit externe.
Référentiel : WCAG 2.2, niveaux A et AA. Les 55 critères sont listés ; 49 sont applicables à
Learny V1, les 6 critères de média temporel (1.2.1 à 1.2.5) et de contrôle du son (1.4.2) ne le
sont pas. Chaque critère « conforme » renvoie à au moins un test existant du dépôt.

| Critère | Niveau | Statut | Mise en œuvre | Test(s) |
|---|---|---|---|---|
| 1.1.1 | A | conforme | Textes alternatifs des images et icônes ; icônes décoratives masquées. | `apps/web/e2e/specs/p8/a11y-audit.spec.ts` |
| 1.2.1 | A | non applicable | Learny V1 ne produit ni ne diffuse de média temporel ; les contenus déposés par l’apprenant sont des contenus tiers. | — |
| 1.2.2 | A | non applicable | Learny V1 ne produit ni ne diffuse de média temporel ; les contenus déposés par l’apprenant sont des contenus tiers. | — |
| 1.2.3 | A | non applicable | Learny V1 ne produit ni ne diffuse de média temporel ; les contenus déposés par l’apprenant sont des contenus tiers. | — |
| 1.2.4 | AA | non applicable | Learny V1 ne produit ni ne diffuse de média temporel ; les contenus déposés par l’apprenant sont des contenus tiers. | — |
| 1.2.5 | AA | non applicable | Learny V1 ne produit ni ne diffuse de média temporel ; les contenus déposés par l’apprenant sont des contenus tiers. | — |
| 1.3.1 | A | conforme | Repères ARIA, tableaux avec th scope, listes et titres structurés. | `apps/web/e2e/specs/p8/a11y-audit.spec.ts` `apps/web/e2e/specs/p8/aria-snapshots.spec.ts` |
| 1.3.2 | A | conforme | Ordre du DOM identique à l’ordre visuel, aucune redisposition CSS. | `apps/web/e2e/specs/p8/a11y-audit.spec.ts` |
| 1.3.3 | A | conforme | Consignes qui ne reposent pas uniquement sur la forme ou la couleur. | `apps/web/e2e/specs/p8/a11y-audit.spec.ts` |
| 1.3.4 | AA | conforme | Mise en page fluide en portrait et paysage, sans orientation imposée. | `apps/web/e2e/specs/p8/a11y-audit.spec.ts` |
| 1.3.5 | AA | conforme | Attributs autocomplete des champs d’identité et de connexion. | `apps/web/e2e/specs/p8/keyboard-journeys.spec.ts` |
| 1.4.1 | A | conforme | Statuts doublés d’un texte ou d’une icône (agenda, maîtrise, modules). | `apps/web/e2e/specs/p8/a11y-audit.spec.ts` |
| 1.4.2 | A | non applicable | Learny V1 ne produit ni ne diffuse de média temporel ; les contenus déposés par l’apprenant sont des contenus tiers. | — |
| 1.4.3 | AA | conforme | Paires de jetons texte/fond ≥ 4,5:1 vérifiées. | `packages/ui/src/tokens/contrast.test.ts` |
| 1.4.4 | AA | conforme | Zoom texte 200 % sans perte d’information. | `apps/web/e2e/specs/p8/text-spacing.spec.ts` |
| 1.4.5 | AA | conforme | Texte réel, aucune image de texte porteuse d’information. | `apps/web/e2e/specs/p8/a11y-audit.spec.ts` |
| 1.4.10 | AA | conforme | Matrice responsive sans défilement horizontal à 320 px et au-delà. | `apps/web/e2e/specs/p8/a11y-audit.spec.ts` |
| 1.4.11 | AA | conforme | Composants et focus ≥ 3:1, contour de focus mesuré. | `packages/ui/src/tokens/contrast.test.ts` `apps/web/e2e/specs/p8/a11y-visual.spec.ts` |
| 1.4.12 | AA | conforme | Espacement du texte (ligne 1,5, paragraphes 2×, lettres et mots) sans coupure. | `apps/web/e2e/specs/p8/text-spacing.spec.ts` |
| 1.4.13 | AA | conforme | Infobulles Radix fermables par Échap, sans masquer leur déclencheur. | `apps/web/e2e/specs/p8/a11y-audit.spec.ts` |
| 2.1.1 | A | conforme | Six parcours complets au clavier (Tab, Maj+Tab, Entrée, Espace, Échap, flèches). | `apps/web/e2e/specs/p8/keyboard-journeys.spec.ts` |
| 2.1.2 | A | conforme | Toile de la carte : un seul arrêt, Échap et Tab en sortent toujours. | `apps/web/e2e/specs/p8/keyboard-journeys.spec.ts` `apps/web/e2e/specs/p8/aria-snapshots.spec.ts` |
| 2.1.4 | A | conforme | Aucun raccourci à une touche hors focus d’un composant. | `apps/web/e2e/specs/p8/keyboard-journeys.spec.ts` |
| 2.2.1 | A | conforme | Durée de l’examen annoncée et justifiée ; aucun autre délai ne coupe une saisie. | `apps/web/e2e/specs/p8/reduced-motion.spec.ts` |
| 2.2.2 | A | conforme | prefers-reduced-motion : transitions 0 ms, aucune animation automatique > 5 s. | `apps/web/e2e/specs/p8/reduced-motion.spec.ts` |
| 2.3.1 | A | conforme | Aucun flash, animations discrètes et désactivables. | `apps/web/e2e/specs/p8/reduced-motion.spec.ts` |
| 2.4.1 | A | conforme | Lien d’évitement « Aller au contenu » premier focusable. | `apps/web/e2e/specs/p8/keyboard-journeys.spec.ts` |
| 2.4.2 | A | conforme | Titre de document unique « <Page> · Learny ». | `apps/web/e2e/specs/p8/a11y-audit.spec.ts` `apps/web/app/accessibilite/page.test.tsx` |
| 2.4.3 | A | conforme | Ordre de focus identique à l’ordre visuel. | `apps/web/e2e/specs/p8/keyboard-journeys.spec.ts` |
| 2.4.4 | A | conforme | Libellés de liens explicites, noms accessibles contenant le texte visible. | `apps/web/e2e/specs/p8/aria-snapshots.spec.ts` |
| 2.4.5 | AA | conforme | Accès multiple : menu, recherche et liste textuelle de la carte. | `apps/web/e2e/specs/p8/keyboard-journeys.spec.ts` |
| 2.4.6 | AA | conforme | Titres et étiquettes descriptifs sur chaque page et contrôle. | `apps/web/e2e/specs/p8/aria-snapshots.spec.ts` |
| 2.4.7 | AA | conforme | Focus visible : contour 2 px, décalage 2 px, contraste ≥ 3:1. | `packages/ui/src/tokens/contrast.test.ts` `apps/web/e2e/specs/p8/a11y-visual.spec.ts` |
| 2.4.11 | AA | conforme | scroll-padding-top/bottom : le focus n’est jamais masqué par l’en-tête ou la barre fixe. | `apps/web/e2e/specs/p8/a11y-visual.spec.ts` `apps/web/e2e/specs/p8/keyboard-journeys.spec.ts` |
| 2.5.1 | A | conforme | Zoom de la carte doublé par des boutons ; aucun geste obligatoire. | `apps/web/e2e/specs/p8/keyboard-journeys.spec.ts` `apps/web/e2e/specs/p8/a11y-audit.spec.ts` |
| 2.5.2 | A | conforme | Activation au relâchement (boutons natifs), annulation possible. | `apps/web/e2e/specs/p8/a11y-audit.spec.ts` |
| 2.5.3 | A | conforme | Nom accessible des boutons icône contenant leur libellé visible. | `apps/web/e2e/specs/p8/aria-snapshots.spec.ts` `apps/web/e2e/specs/p8/a11y-visual.spec.ts` |
| 2.5.4 | A | conforme | Aucune activation par le mouvement de l’appareil. | `apps/web/e2e/specs/p8/a11y-audit.spec.ts` |
| 2.5.7 | AA | conforme | Association, classement et déplacement de la carte utilisables sans glisser. | `apps/web/e2e/specs/p8/keyboard-journeys.spec.ts` `apps/web/e2e/specs/p8/a11y-audit.spec.ts` |
| 2.5.8 | AA | conforme | Cibles ≥ 24 px (44 px pour les contrôles de la coquille). | `apps/web/e2e/specs/p8/a11y-audit.spec.ts` `apps/web/e2e/specs/p8/a11y-visual.spec.ts` |
| 3.1.1 | A | conforme | <html lang="fr"> sur toutes les pages. | `apps/web/e2e/specs/p8/a11y-audit.spec.ts` `apps/web/app/accessibilite/page.test.tsx` |
| 3.1.2 | AA | conforme | Attribut lang des contenus de cours et messages du tuteur dans une autre langue. | `apps/web/e2e/specs/p8/a11y-audit.spec.ts` |
| 3.2.1 | A | conforme | Aucun changement de contexte au focus. | `apps/web/e2e/specs/p8/keyboard-journeys.spec.ts` |
| 3.2.2 | A | conforme | Aucun changement de contexte à la saisie sans validation. | `apps/web/e2e/specs/p8/a11y-audit.spec.ts` |
| 3.2.3 | AA | conforme | Navigation et pied de page identiques sur toutes les pages publiques. | `apps/web/components/site-footer/SiteFooter.test.tsx` `apps/web/test/integration/public-routes.test.ts` |
| 3.2.4 | AA | conforme | Identification cohérente des composants partagés. | `apps/web/e2e/specs/p8/a11y-audit.spec.ts` `apps/web/e2e/specs/p8/aria-snapshots.spec.ts` |
| 3.2.6 | A | conforme | Aide cohérente : « Gérer les notifications » et « Mon compte » au même endroit. | `apps/web/components/site-footer/SiteFooter.test.tsx` `apps/web/e2e/specs/p8/keyboard-journeys.spec.ts` |
| 3.3.1 | A | conforme | Erreurs identifiées par un texte et reliées au champ (aria-describedby, role=alert). | `apps/web/e2e/specs/p8/keyboard-journeys.spec.ts` `packages/ui/test/integration/live-region.test.tsx` |
| 3.3.2 | A | conforme | Étiquettes et instructions sur chaque champ. | `apps/web/e2e/specs/p8/keyboard-journeys.spec.ts` `apps/web/e2e/specs/p8/aria-snapshots.spec.ts` |
| 3.3.3 | AA | conforme | Suggestion de correction dans les messages d’erreur. | `apps/web/e2e/specs/p8/keyboard-journeys.spec.ts` |
| 3.3.4 | AA | conforme | Dialogues de confirmation avant suppression et soumission irréversible. | `apps/web/e2e/specs/p8/keyboard-journeys.spec.ts` `apps/web/e2e/specs/p8/aria-snapshots.spec.ts` |
| 3.3.7 | A | conforme | Informations déjà saisies préremplies (rythme du profil dans une nouvelle formation). | `apps/web/e2e/specs/p8/keyboard-journeys.spec.ts` |
| 3.3.8 | AA | conforme | Collage autorisé, autocomplete correct, lien magique alternatif sans mémorisation. | `apps/web/e2e/specs/p8/keyboard-journeys.spec.ts` `apps/web/e2e/specs/p8/aria-snapshots.spec.ts` |
| 4.1.2 | A | conforme | Rôles ARIA, noms accessibles et valeurs vérifiés par instantanés. | `apps/web/e2e/specs/p8/aria-snapshots.spec.ts` `apps/web/e2e/specs/p8/keyboard-journeys.spec.ts` |
| 4.1.3 | AA | conforme | Région aria-live unique de la coquille pour les messages d’état. | `packages/ui/test/integration/live-region.test.tsx` `apps/web/e2e/specs/p8/keyboard-journeys.spec.ts` |

## Non-conformités connues

Aucune non-conformité connue à la date de l’audit.

## Dérogations

Les contenus déposés par l’apprenant et les contenus générés à partir de ses apports sont des
contenus tiers. Les vidéos YouTube sont intégrées comme liens, jamais comme lecteurs embarqués.
Aucun test avec un lecteur d’écran réel n’est automatisable dans cet environnement : les noms et
rôles sont vérifiés par `toMatchAriaSnapshot` et `getByRole` (SPEC-803 ET-7).
