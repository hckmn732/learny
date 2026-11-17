// Frozen catalogue of the WCAG 2.2 level A and AA success criteria (SPEC-803 ET-2, CA-6).
// The grid of `docs/accessibility/wcag-2-2-grille.md` must cover exactly this list; the six
// criteria that Learny V1 does not produce content for are marked non applicable, with a reason.

export type WcagLevel = 'A' | 'AA';

export interface WcagCriterion {
  /** Stable criterion number, for example `2.4.11`. */
  id: string;
  level: WcagLevel;
  title: string;
  /** False when no content of Learny V1 can trigger the criterion (1.2.x and 1.4.2). */
  applicable?: boolean;
  /** Why the criterion does not apply; absent for applicable criteria. */
  reason?: string;
}

const NOT_APPLICABLE_REASON =
  'Learny V1 ne produit ni ne diffuse de média temporel ; les contenus déposés par l’apprenant sont des contenus tiers.';

export const WCAG22_CRITERIA: readonly WcagCriterion[] = [
  { id: '1.1.1', level: 'A', title: 'Contenu non textuel' },
  {
    id: '1.2.1',
    level: 'A',
    title: 'Contenu audio et vidéo préenregistrés',
    applicable: false,
    reason: NOT_APPLICABLE_REASON,
  },
  {
    id: '1.2.2',
    level: 'A',
    title: 'Sous-titres préenregistrés',
    applicable: false,
    reason: NOT_APPLICABLE_REASON,
  },
  {
    id: '1.2.3',
    level: 'A',
    title: 'Audiodescription préenregistrée ou texte alternatif',
    applicable: false,
    reason: NOT_APPLICABLE_REASON,
  },
  {
    id: '1.2.4',
    level: 'AA',
    title: 'Sous-titres en direct',
    applicable: false,
    reason: NOT_APPLICABLE_REASON,
  },
  {
    id: '1.2.5',
    level: 'AA',
    title: 'Audiodescription préenregistrée',
    applicable: false,
    reason: NOT_APPLICABLE_REASON,
  },
  { id: '1.3.1', level: 'A', title: 'Information et relations' },
  { id: '1.3.2', level: 'A', title: 'Ordre logique' },
  { id: '1.3.3', level: 'A', title: 'Caractéristiques sensorielles' },
  { id: '1.3.4', level: 'AA', title: 'Orientation' },
  { id: '1.3.5', level: 'AA', title: 'Identifier la finalité de chaque champ' },
  { id: '1.4.1', level: 'A', title: 'Utilisation de la couleur' },
  {
    id: '1.4.2',
    level: 'A',
    title: 'Contrôle du son',
    applicable: false,
    reason: NOT_APPLICABLE_REASON,
  },
  { id: '1.4.3', level: 'AA', title: 'Contraste (minimum)' },
  { id: '1.4.4', level: 'AA', title: 'Redimensionnement du texte' },
  { id: '1.4.5', level: 'AA', title: 'Texte sous forme d’image' },
  { id: '1.4.10', level: 'AA', title: 'Redisposition' },
  { id: '1.4.11', level: 'AA', title: 'Contraste des éléments non textuels' },
  { id: '1.4.12', level: 'AA', title: 'Espacement du texte' },
  { id: '1.4.13', level: 'AA', title: 'Contenu au survol ou au focus' },
  { id: '2.1.1', level: 'A', title: 'Clavier' },
  { id: '2.1.2', level: 'A', title: 'Pas de piège au clavier' },
  { id: '2.1.4', level: 'A', title: 'Raccourcis clavier de caractère' },
  { id: '2.2.1', level: 'A', title: 'Réglage du délai' },
  { id: '2.2.2', level: 'A', title: 'Mettre en pause, arrêter, masquer' },
  { id: '2.3.1', level: 'A', title: 'Pas plus de trois flashs' },
  { id: '2.4.1', level: 'A', title: 'Contourner des blocs' },
  { id: '2.4.2', level: 'A', title: 'Titre de page' },
  { id: '2.4.3', level: 'A', title: 'Ordre de focus' },
  { id: '2.4.4', level: 'A', title: 'Finalité des liens' },
  { id: '2.4.5', level: 'AA', title: 'Accès multiple' },
  { id: '2.4.6', level: 'AA', title: 'En-têtes et étiquettes' },
  { id: '2.4.7', level: 'AA', title: 'Focus visible' },
  { id: '2.4.11', level: 'AA', title: 'Apparence du focus non masquée' },
  { id: '2.5.1', level: 'A', title: 'Gestes de pointage' },
  { id: '2.5.2', level: 'A', title: 'Annulation du pointage' },
  { id: '2.5.3', level: 'A', title: 'Étiquette dans le nom' },
  { id: '2.5.4', level: 'A', title: 'Activation par le mouvement' },
  { id: '2.5.7', level: 'AA', title: 'Mouvements de glissement' },
  { id: '2.5.8', level: 'AA', title: 'Taille de la cible' },
  { id: '3.1.1', level: 'A', title: 'Langue de la page' },
  { id: '3.1.2', level: 'AA', title: 'Langue d’un passage' },
  { id: '3.2.1', level: 'A', title: 'Au focus' },
  { id: '3.2.2', level: 'A', title: 'À la saisie' },
  { id: '3.2.3', level: 'AA', title: 'Navigation cohérente' },
  { id: '3.2.4', level: 'AA', title: 'Identification cohérente' },
  { id: '3.2.6', level: 'A', title: 'Aide cohérente' },
  { id: '3.3.1', level: 'A', title: 'Identification des erreurs' },
  { id: '3.3.2', level: 'A', title: 'Étiquettes ou instructions' },
  { id: '3.3.3', level: 'AA', title: 'Suggestion après une erreur' },
  { id: '3.3.4', level: 'AA', title: 'Prévention des erreurs' },
  { id: '3.3.7', level: 'A', title: 'Saisie redondante' },
  { id: '3.3.8', level: 'AA', title: 'Authentification accessible' },
  { id: '4.1.2', level: 'A', title: 'Nom, rôle et valeur' },
  { id: '4.1.3', level: 'AA', title: 'Messages d’état' },
];

export type WcagCriterionId = string;

export const WCAG22_CRITERIA_COUNT = WCAG22_CRITERIA.length;
export const WCAG22_APPLICABLE_COUNT = WCAG22_CRITERIA.filter((c) => c.applicable !== false).length;
export const WCAG22_NOT_APPLICABLE = WCAG22_CRITERIA.filter((c) => c.applicable === false);

export function wcagCriterion(id: string): WcagCriterion | undefined {
  return WCAG22_CRITERIA.find((criterion) => criterion.id === id);
}
