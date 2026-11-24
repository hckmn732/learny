// Textes français des rendus natifs de briques (SPEC-3301 § 9, ADR-3005 § 3).
//
// Les libellés identiques au web sont recopiés à l'identique de `packages/bricks/src/view/labels.ts`
// (BR-ACC-06) ; les textes propres au mobile (accessibilité, galerie, états de chargement) vivent
// ici. Aucun écran n'écrit une phrase en dur : tout passe par `fr.mobile.bricks`.
export const mobileBricks = {
  /** Nom de chaque type, tel que le web l'affiche. */
  types: {
    text: 'Texte',
    resource_excerpt: 'Extrait de ressource',
    choice_question: 'Question à choix',
    open_question: 'Question ouverte',
    cloze: 'Texte à trous',
    matching: 'Association',
    ordering: 'Remise en ordre',
    categorization: 'Classement',
    recall_card: 'Carte de rappel',
    instruction: 'Consigne',
    scripted_dialogue: 'Dialogue scénarisé',
    timer: 'Minuteur',
    scoring: 'Barème',
  },
  /** Consigne de la question à choix (EF-2). */
  singleAnswer: 'Une seule réponse.',
  multipleAnswer: 'Plusieurs réponses.',
  /** Correction (BR-BRI-08, BR-MEM-10). */
  exact: 'Exact.',
  almost: 'Pas tout à fait.',
  answerExpected: (answer: string) => `Réponse attendue : ${answer}`,
  expectedAnswerShort: (answer: string) => `Attendu : ${answer}`,
  /** Question ouverte (EF-3). */
  yourAnswer: 'Votre réponse',
  characters: (count: number, max: number) => `${String(count)} / ${String(max)} caractères`,
  tutorCorrection: 'Correction par le tuteur à la fin de la tentative.',
  /** Association, remise en ordre, classement (EF-5, ET-4). */
  clozeStem: 'Complétez de tête, sans liste de choix.',
  matchingHelp: 'Touchez une notion, puis la définition qui lui correspond.',
  orderingHelp: 'Touchez un élément, puis celui avec lequel l’échanger.',
  categorizationHelp: 'Touchez un élément, puis sa catégorie.',
  placed: (item: string, target: string) => `${item} placé dans ${target}`,
  linked: (left: string, right: string) => `${left} associé à ${right}`,
  unlinked: (left: string) => `${left} libéré`,
  unassigned: 'Sans catégorie',
  moveUp: 'Monter',
  moveDown: 'Descendre',
  position: (index: number, total: number) => `Position ${String(index)} sur ${String(total)}`,
  gapLabel: (index: number, total: number) => `Trou ${String(index)} sur ${String(total)}`,
  chooseCategory: 'Choisir une catégorie',
  /** Carte de rappel (EF-6). */
  reveal: 'Révéler la réponse',
  hide: 'Masquer la réponse',
  recallFront: 'Recto · cherchez de tête',
  recallBack: 'Verso · réponse',
  recallSource: (source: string) => `Source : ${source}`,
  /** Renvoi au web (CL-1, ADR-3009 § 2). */
  webOnlyTitle: 'Cette activité se fait sur le web',
  webOnlyBody:
    'Cet exercice se passe sur le web, avec le même tuteur et la même progression. Votre travail est conservé.',
  continueOnWeb: 'Continuer sur le web',
  /** Charge invalide (CL-2, BR-BRI-02). */
  invalidTitle: 'Ce contenu ne peut pas être affiché',
  invalidBody:
    'La charge reçue n’a pas le format attendu. Vous pouvez continuer le reste de la séance.',
  /** Markdown (ET-3). */
  markdownTable: 'Tableau',
  markdownCode: 'Bloc de code',
  markdownLinkHint: 'Ouvre le lien dans le navigateur de l’application.',
  markdownImage: (alt: string) => `Image : ${alt}`,
  /** Blocs de la charge (EF-7). */
  takeaway: 'À retenir',
  comparison: 'Ne pas confondre',
  quickQuestion: 'Question éclair · avant de lire la suite',
  showAnswer: 'Afficher la réponse',
  hideAnswer: 'Masquer la réponse',
  /** Sources (BR-COU-02). */
  source: 'Source',
  sourcePage: (page: number) => `p. ${String(page)}`,
  sourceMinute: (minute: number) => `min. ${String(minute)}`,
  sourceExcerpt: 'extrait',
  sourceAnchor: (anchor: string) => `ancre ${anchor}`,
  openResource: 'Ouvrir la ressource',
  openResourceHint: 'Ouvre la ressource dans le navigateur de l’application.',
  /** Galerie `/_dev/bricks` (EF-8). */
  gallery: {
    eyebrow: 'Démonstration SDD',
    title: 'Briques et Markdown',
    intro:
      'Les treize types de briques, chacun en lecture, en jeu et corrigé. Les quatre types hors périmètre mobile ouvrent le web.',
    mode: 'Mode',
    read: 'Lecture',
    play: 'Jeu',
    corrected: 'Corrigé',
    sections: {
      native: 'Rendus natifs',
      web: 'Renvois au web',
      markdown: 'Markdown',
    },
    markdownTitle: 'Markdown de référence',
    markdownSample: 'Échantillon Markdown',
    responseLabel: 'Réponse envoyée',
    correctionLabel: 'Correction',
    actions: { knew: 'Je savais', review: 'À revoir' },
    footer: 'Galerie visible seulement si EXPO_PUBLIC_ENABLE_SDD_PAGES=1.',
  },
} as const;

export type MobileBrickMessages = typeof mobileBricks;
