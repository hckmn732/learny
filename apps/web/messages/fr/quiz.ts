export const quiz = {
  breadcrumb: 'Quiz de validation',
  title: 'Quiz de validation',
  attempt: (n: number) => `Tentative ${String(n)}`,
  threshold: (percent: number) => `Seuil ${String(percent)} %`,
  quit: 'Quitter le quiz',
  progress: (position: number, total: number) =>
    `Question ${String(position)} sur ${String(total)}`,
  note: 'Correction immédiate · nouvelles questions à chaque tentative',
  check: 'Vérifier',
  checking: 'Vérification…',
  next: 'Question suivante',
  finish: 'Terminer la tentative',
  loading: 'Préparation de votre quiz…',
  preparing: 'Le tuteur prépare de nouvelles questions…',
  preparingTooLong:
    'La préparation des questions prend plus de temps que prévu. Réessayez dans quelques minutes.',
  retry: 'Réessayer',
  exact: 'Exact.',
  almost: 'Pas tout à fait.',
  answerSaved: 'Réponse enregistrée.',
  answerSavedText: 'Réponse enregistrée. Le tuteur la corrigera à la fin de la tentative.',
  missingAnswer: 'Donnez une réponse avant de vérifier.',
  errorTitle: 'Le quiz n’a pas pu être chargé.',
  submitError: 'La tentative n’a pas pu être soumise.',
  openAnswer: 'Votre réponse',
  characters: (count: number, max: number) => `${String(count)} / ${String(max)} caractères`,
  choose: 'Choisir…',
  clozeStem: 'Complétez de tête, sans liste de choix.',
  gapLabels: [
    'Premier mot manquant',
    'Second mot manquant',
    'Troisième mot manquant',
    'Quatrième mot manquant',
    'Cinquième mot manquant',
    'Sixième mot manquant',
    'Septième mot manquant',
    'Huitième mot manquant',
    'Neuvième mot manquant',
    'Dixième mot manquant',
  ],
  resultTitle: 'Résultat de la tentative',
  resultPending: 'Le tuteur corrige vos réponses ouvertes…',
  resultPendingText: 'La page se met à jour automatiquement dès que la correction est terminée.',
  resultWaiting: 'Correction des questions ouvertes en attente',
  resultWaitingText:
    'Vos réponses ouvertes n’ont pas encore été corrigées. Vous pouvez relancer la correction.',
  resultScore: (score: number) => `${String(score)} %`,
  resultPassed: 'Module validé',
  resultFailed: 'Pas encore validé',
  resultProvisional: 'Score provisoire',
  resultBack: 'Retour au module',
  resultDetailed: 'Le résultat détaillé et la remédiation arrivent à l’étape suivante.',
  resultThresholdCaption: (threshold: number) => `trait : seuil ${String(threshold)} %`,
  resultHeadlinePassed: (modulePosition: number) =>
    `Le module ${String(modulePosition)} est débloqué.`,
  resultHeadlineLast: 'La formation est terminée.',
  resultHeadlineMissing: (points: number) =>
    points === 1 ? 'Encore 1 point pour valider.' : `Encore ${String(points)} points pour valider.`,
  resultStatusTextPassed: (fragile: number) =>
    fragile === 0
      ? 'Bravo. Les notions du module rejoignent votre quiz global ; aucune ne reste fragile.'
      : fragile === 1
        ? 'Bravo. Les notions du module rejoignent votre quiz global ; une seule reste fragile.'
        : `Bravo. Les notions du module rejoignent votre quiz global ; ${String(fragile)} restent fragiles.`,
  resultStatusTextFailed: (gaps: number) =>
    `Votre prochaine tentative portera surtout sur les ${String(gaps)} notions ci-dessous, avec de nouvelles questions.`,
  resultHistoryTitle: 'Vos tentatives',
  resultHistoryItem: (attemptNo: number, score: number) =>
    `Tentative ${String(attemptNo)} : ${String(score)} %,`,
  resultHistoryItemSuffix: (passed: boolean) => (passed ? 'validée' : 'non validée'),
  resultHistoryAltLabel: 'Historique des tentatives',
  resultGapsTitle: (count: number) =>
    count === 1 ? 'Lacunes détectées · 1 notion' : `Lacunes détectées · ${String(count)} notions`,
  resultFragileTitle: (count: number) =>
    count === 1 ? 'Encore fragile · 1 notion' : `Encore fragile · ${String(count)} notions`,
  resultGapsSubtitle: 'Analysées sur toutes vos tentatives · prioritaires dans le quiz global',
  resultTutorProposal: 'Le tuteur propose :',
  resultTrain: "S'entraîner",
  resultMasteredTitle: (count: number) =>
    count === 1 ? '1 notion maîtrisée' : `${String(count)} notions maîtrisées`,
  resultPerNotion: 'Détail par notion',
  resultPerNotionLine: (label: string, correct: number, total: number, score: number) =>
    `${label} · ${String(correct)}/${String(total)} · ${String(score)} %`,
  resultReread: 'Relire le cours',
  resultRetry: 'Nouvelle tentative',
  resultRetryAvailable: (label: string) => `Disponible ${label}`,
  resultRetryAvailableAt: (label: string) => `Nouvelle tentative possible ${label}.`,
  resultRetryAfterRemediation: 'Disponible après la remédiation',
  resultRetryAfterRemediationAt: (label: string) =>
    `Nouvelle tentative possible après la remédiation, au plus tôt ${label}.`,
  resultRetrySettings: 'Régler',
  resultRemediation: 'Remédiation ciblée · 15 min',
  resultRemediationResume: 'Reprendre la remédiation',
  resultRemediationDone: 'Remédiation terminée',
  resultHome: "Retour à l'accueil",
  resultNextModule: (position: number) => `Ouvrir le module ${String(position)}`,
  resultFinalReport: 'Voir le bilan final',
  resultError: 'Le résultat n’a pas pu être chargé.',
  availableDateFormat: (weekday: string, day: string, month: string, time: string) =>
    `${weekday} ${day} ${month} à ${time}`,
  lockedTitle: 'Ce module est verrouillé.',
  lockedText: 'Ce module est verrouillé.',
  lockedBack: 'Retour au programme',
} as const;

export const fr = { quiz } as const;
