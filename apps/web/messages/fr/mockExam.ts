export const mockExam = {
  breadcrumb: 'Examen blanc',
  title: 'Examen blanc',
  subtitle: (title: string) => `${title} · préparation à la certification`,
  questionsLabel: 'questions à choix',
  durationLabel: (minutes: number) => `${String(minutes)} min`,
  timedLabel: 'chronométrées',
  thresholdLabel: (percent: number) => `${String(percent)} %`,
  passLabel: 'pour réussir',
  formatGuide:
    'Format officiel : durée, nombre de questions et seuil sont repris de votre guide de certification (apport importé). Sans format connu, le tuteur aurait proposé une épreuve chronométrée, sans aide, corrigée à la fin.',
  formatDefault:
    'Sans guide de certification, le tuteur propose 20 questions, 2 minutes par question et un seuil de 70 %. L’épreuve est chronométrée, sans aide et corrigée à la fin.',
  formatPending: 'Confirmez ce format proposé depuis votre guide pour lancer l’épreuve.',
  confirmFormat: 'Confirmer le format',
  confirmingFormat: 'Confirmation…',
  rulesTitle: 'Les règles',
  rules: [
    'Le chronomètre démarre dès le début et ne s’arrête pas.',
    'Sans aide : le menu, le tuteur et les cours sont masqués pendant l’épreuve.',
    'Vous pouvez naviguer entre les questions et en marquer pour y revenir.',
    'La correction arrive à la fin, ou quand le temps est écoulé.',
  ],
  diagnosticTitle: 'Aujourd’hui : diagnostic',
  diagnosticLine: (from: number, to: number, count: number) =>
    from === to
      ? `Le module ${String(from)} n’est pas encore étudié. Sa question est comptée à part : elle montre où vous partez, sans pénaliser le reste.`
      : `Les modules ${String(from)} à ${String(to)} ne sont pas encore étudiés. Leurs ${String(count)} questions sont comptées à part : elles montrent où vous partez, sans pénaliser le reste.`,
  noDiagnostic:
    'Tous les modules sont déjà étudiés : le score global reflète votre préparation complète.',
  nextExams: (dates: string) => `Prochains examens blancs : ${dates}.`,
  noNextExams: 'Les prochains examens blancs seront planifiés avec votre programme.',
  start: "Commencer l'examen",
  starting: 'Préparation de l’examen…',
  resume: 'Reprendre l’examen',
  examTitle: 'Examen blanc',
  answered: (count: number, total: number) =>
    `${String(count)} répondue${count > 1 ? 's' : ''} sur ${String(total)}`,
  markedSuffix: (count: number) => ` · ${String(count)} à revoir`,
  submit: "Terminer l'examen",
  questionCounter: (position: number, total: number) =>
    `Question ${String(position)} sur ${String(total)}`,
  markedBadge: 'Marquée pour revoir',
  previous: 'Précédente',
  next: 'Suivante',
  finish: 'Terminer',
  mark: 'Marquer pour revoir',
  unmark: 'Ne plus marquer',
  paletteLabel: 'Questions',
  paletteQuestion: (position: number, answered: boolean, marked: boolean) =>
    `Question ${String(position)}${answered ? ', répondue' : ', sans réponse'}${marked ? ', à revoir' : ''}`,
  legendAnswered: 'Répondue',
  legendMarked: 'À revoir',
  legendEmpty: 'Sans réponse',
  confirmTitle: "Terminer l'examen ?",
  confirmText: (unanswered: number, marked: number, minutes: number) => {
    const missing =
      unanswered > 0
        ? `${String(unanswered)} question${unanswered > 1 ? 's' : ''} sans réponse`
        : 'Toutes les questions ont une réponse';
    const review =
      marked > 0 ? ` et ${String(marked)} marquée${marked > 1 ? 's' : ''} pour revoir` : '';
    return `${missing}${review}. Il vous reste ${String(minutes)} min. Une fois terminé, vous ne pourrez plus modifier vos réponses.`;
  },
  cancelFinish: 'Revenir aux questions',
  confirmFinish: 'Terminer',
  timerAria: (minutes: number) => `Temps restant : ${String(minutes)} minutes`,
  loading: 'Chargement de l’examen…',
  errorTitle: 'L’examen n’a pas pu être chargé.',
  retry: 'Réessayer',
  saving: 'Enregistrement…',
  resultsTitle: "Résultats de l'examen blanc",
  timeUsed: (
    minutes: number,
    total: number,
    answered: number,
    questions: number,
    timedOut: boolean,
  ) =>
    `${timedOut ? `Temps écoulé : ${String(total)} min` : `Terminé en ${String(minutes)} min sur ${String(total)}`} · ${String(answered)} réponse${answered > 1 ? 's' : ''} sur ${String(questions)}`,
  scoreGlobal: 'Score global',
  studiedLabel: (from: number, to: number) => `Modules étudiés · ${String(from)} à ${String(to)}`,
  diagnosticLabel: (from: number, to: number) => `Diagnostic · ${String(from)} à ${String(to)}`,
  studiedNote: (atLevel: boolean) =>
    atLevel
      ? 'Au niveau attendu sur ce qui a été étudié'
      : 'Encore fragile sur ce qui a été étudié',
  diagnosticNote: 'Point de départ, non pénalisant',
  passed: (threshold: number) => `Seuil de ${String(threshold)} % atteint`,
  failed: (threshold: number) => `Sous le seuil de ${String(threshold)} %`,
  byModule: 'Par module',
  moduleTag: ' · diagnostic',
  gapsTitle: (count: number) =>
    count > 0 ? `Erreurs sur les modules étudiés · ${String(count)}` : 'Modules étudiés',
  noGaps: 'Aucune erreur sur les modules étudiés.',
  seeGaps: 'Voir Mes lacunes',
  planTitle: 'Ce que le tuteur prévoit',
  review: 'Revoir mes réponses',
  back: 'Retour au programme',
  restart: "Repasser l'examen",
  reviewTitle: 'Vos réponses',
  filterAll: 'Toutes',
  filterErrors: 'Erreurs seulement',
  yourAnswer: 'Votre réponse : ',
  correctAnswer: ' · Bonne réponse : ',
  noAnswer: 'sans réponse',
  moduleLine: (position: number, label: string) => `Module ${String(position)} · ${label}`,
} as const;

export const fr = { mockExam } as const;
