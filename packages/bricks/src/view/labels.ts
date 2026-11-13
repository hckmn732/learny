// French interface texts of the brick views (SPEC-503 ET-1). The app may override any entry with
// the `labels` prop; `apps/web/messages/fr.ts` re-exports this object.
import type { BrickType } from '../brick-types';
import type { SelfGrade } from '../correction-view';

const TYPE_LABELS: Record<BrickType, string> = {
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
};

const QUESTION_TYPE_LABELS: Partial<Record<BrickType, string>> = {
  choice_question: 'Choix unique',
  cloze: 'Texte à trous',
  matching: 'Association',
  ordering: 'Remise en ordre',
  categorization: 'Classement',
  recall_card: 'Carte de rappel',
  open_question: 'Question ouverte',
};

export interface BrickViewLabels {
  type: (type: BrickType, mode?: 'single' | 'multiple') => string;
  notionPrefix: string;
  multipleAnswers: string;
  clozeStem: string;
  choose: string;
  verify: string;
  verifyOrder: string;
  verifyMatching: string;
  verifyCategorization: string;
  reset: string;
  checking: string;
  exact: string;
  almost: string;
  answerExpected: (answer: string) => string;
  expectedAnswers: (answers: string) => string;
  gapLabel: (index: number, total: number) => string;
  matchingHelp: string;
  moveUp: string;
  moveDown: string;
  recallFront: string;
  recallBack: string;
  recallFlip: string;
  recallSource: (source: string) => string;
  recallQuestion: string;
  selfGrade: Record<SelfGrade, string>;
  dueLabels: Record<SelfGrade, string>;
  openAnswer: string;
  characters: (count: number, max: number) => string;
  tutorNote: string;
  missingElements: string;
  criteria: string;
  instructionConsigne: string;
  instructionEntry: string;
  instructionAddRow: string;
  instructionRemoveRow: (row: number) => string;
  instructionHint: (index: number) => string;
  instructionRequestHint: string;
  instructionSubmit: string;
  instructionExplanation: string;
  instructionNotStarted: string;
  instructionBalanced: string;
  instructionDifference: (amount: string) => string;
  instructionDebit: string;
  instructionCredit: string;
  instructionReview: string;
  instructionScore: (score: number, max: number) => string;
  tableRow: string;
  tableRemove: string;
  excerptDeleted: string;
  timerLabel: (minutes: number) => string;
  timerWarning: string;
  scoringTitle: (total: number) => string;
  scoringThreshold: (threshold: number) => string;
  scoringHintPenalty: string;
  dialogueRole: string;
  dialogueContext: string;
  dialogueGoal: string;
  dialogueEnd: string;
  dialogueEndValue: string;
  dialogueOpening: string;
  dialogueTurns: (turns: number) => string;
  sourcePrefix: string;
  empty: string;
}

export const brickViewLabels: BrickViewLabels = {
  type: (type, mode) => {
    if (type === 'choice_question' && mode === 'multiple') return 'Choix multiple';
    return QUESTION_TYPE_LABELS[type] ?? TYPE_LABELS[type];
  },
  notionPrefix: 'Notion : ',
  multipleAnswers: 'Plusieurs réponses possibles',
  clozeStem: 'Complétez de tête, sans liste de choix.',
  choose: 'Choisir…',
  verify: 'Vérifier',
  verifyOrder: "Vérifier l'ordre",
  verifyMatching: 'Vérifier',
  verifyCategorization: 'Vérifier le classement',
  reset: 'Recommencer',
  checking: 'Vérification…',
  exact: 'Exact.',
  almost: 'Pas tout à fait.',
  answerExpected: (answer) => `Réponse attendue : ${answer}`,
  expectedAnswers: (answers) => `Réponses attendues : ${answers}`,
  gapLabel: (index, total) => `Trou ${String(index)} sur ${String(total)}`,
  matchingHelp: 'Touchez une notion, puis la définition qui lui correspond.',
  moveUp: 'Monter',
  moveDown: 'Descendre',
  recallFront: 'Recto · cherchez de tête',
  recallBack: 'Verso · réponse',
  recallFlip: 'Retourner la carte',
  recallSource: (source) => `Source : ${source}`,
  recallQuestion: 'Aviez-vous trouvé ?',
  selfGrade: { again: 'Raté', hard: 'Difficile', good: 'Bon', easy: 'Facile' },
  dueLabels: {
    again: 'Demain',
    hard: 'Dans 2 jours',
    good: 'Dans 6 jours',
    easy: 'Dans 2 semaines',
  },
  openAnswer: 'Votre réponse',
  characters: (count, max) => `${String(count)} / ${String(max)} caractères`,
  tutorNote: 'Note du tuteur',
  missingElements: 'Éléments manquants',
  criteria: 'Critères',
  instructionConsigne: 'Consigne',
  instructionEntry: 'Votre saisie',
  instructionAddRow: 'Ajouter un poste',
  instructionRemoveRow: (row) => `Retirer le poste ${String(row)}`,
  instructionHint: (index) => `Indice ${String(index)} :`,
  instructionRequestHint: 'Demander un indice',
  instructionSubmit: 'Soumettre au tuteur',
  instructionExplanation: 'Expliquez avec vos mots',
  instructionNotStarted: 'Pas encore de montant',
  instructionBalanced: '✓ Pièce équilibrée',
  instructionDifference: (amount) => `Écart : ${amount} €`,
  instructionDebit: 'Débit',
  instructionCredit: 'Crédit',
  instructionReview: 'Correction du tuteur',
  instructionScore: (score, max) => `${String(score)} / ${String(max)}`,
  tableRow: 'Poste',
  tableRemove: 'Retirer',
  excerptDeleted: 'Source supprimée',
  timerLabel: (minutes) => `Temps restant : ${String(minutes)} minutes`,
  timerWarning: 'Il reste 5 minutes',
  scoringTitle: (total) => `Barème · ${String(total)} points`,
  scoringThreshold: (threshold) => `Seuil ${String(threshold)} %`,
  scoringHintPenalty: 'Chaque indice utilisé retire 1 point.',
  dialogueRole: 'Rôle',
  dialogueContext: 'Contexte',
  dialogueGoal: 'Objectif',
  dialogueEnd: 'Condition de fin',
  dialogueEndValue: 'Précisée par le tuteur pendant l’échange.',
  dialogueOpening: 'Première réplique',
  dialogueTurns: (turns) => `${String(turns)} échanges au maximum`,
  sourcePrefix: 'Source : ',
  empty: 'Aucun élément',
};

export type BrickViewLabelsOverride = Partial<BrickViewLabels>;

export function resolveLabels(overrides?: BrickViewLabelsOverride): BrickViewLabels {
  if (!overrides) return brickViewLabels;
  return { ...brickViewLabels, ...overrides };
}
