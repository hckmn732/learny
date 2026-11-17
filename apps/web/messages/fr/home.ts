export const home = {
  title: 'Learny',
  subtitle: 'Application en cours de construction.',
  demoLink: 'Pages de démonstration',
  header: {
    newFormation: 'Nouvelle formation',
    title: "Votre journée d'apprentissage",
  },
  day: {
    title: (count: number) => `Aujourd'hui · ${String(count)} activité${count === 1 ? '' : 's'}`,
    summary: (planned: string, done: string) => `${planned} prévues · ${done} faites`,
    empty: "Aucune activité prévue aujourd'hui.",
    agenda: "Ouvrir l'agenda",
    done: 'Fait',
    missed: 'Manqué',
    upcoming: 'À venir',
    ongoing: 'En cours',
    inMinutes: (minutes: number) => `Dans ${String(minutes)} min`,
    doIt: 'Faire',
    statusLabel: (title: string) => `Statut de ${title}`,
  },
  retention: {
    title: 'Notions retenues à 1 mois',
    twoMonths: (percent: number) =>
      `${String(percent)} % à 2 mois. Mesuré par le quiz global sur les modules validés.`,
    noTwoMonths:
      'Pas encore de mesure à 2 mois. Mesuré par le quiz global sur les modules validés.',
    noMeasure:
      "Pas encore de mesure : la rétention apparaît 30 jours après la validation d'un premier module.",
    ringLabel: (percent: number | null) =>
      percent === null
        ? 'Aucune mesure de rétention à 1 mois'
        : `Notions retenues à 1 mois : ${String(percent)} %`,
  },
  quiz: {
    title: 'Quiz global du jour',
    notions: (count: number) =>
      count === 1 ? '1 notion à revoir' : `${String(count)} notions à revoir`,
    line: (formation: string, games: number, minutes: number) =>
      `${formation} · ${String(games)} jeu${games === 1 ? '' : 'x'} · ${String(minutes)} min`,
    gaps: 'lacunes en priorité',
    deferred: (due: number, deferred: number, day: string, cap: number) =>
      `${String(due)} notions étaient dues : ${String(deferred)} reportées à ${day} pour rester sous ${String(cap)} min.`,
    play: 'Jouer maintenant',
    nothing: "Rien à revoir aujourd'hui",
    nextReview: (day: string) => `Prochaine révision : ${day}`,
    startAfterModule: "Les révisions commencent après la validation d'un premier module.",
  },
  proposal: {
    kickerAsk: 'Le tuteur propose · votre accord est demandé',
    kickerDone: 'Séance replacée',
    kickerCardDone: 'Le tuteur a agi pour vous',
    iconLabel: 'Proposition du tuteur',
    accept: 'Accepter',
    other: 'Autre créneau',
    slotsLabel: 'Créneaux libres proposés par le tuteur',
    decline: 'Ne pas replacer',
    refuse: 'Refuser',
    undo: 'Annuler',
    options: 'Voir les options',
    later: 'Pas maintenant',
    planTitle: 'Alléger le programme ou décaler la fin',
    shiftEnd: 'Décaler la fin',
    lighten: 'Alléger le programme',
    choose: 'Choisir',
    more: (count: number) =>
      count === 1 ? '1 autre proposition' : `${String(count)} autres propositions`,
    toastError: "L'action n'a pas pu être enregistrée. Réessayez.",
    toastExpired: 'Cette proposition a expiré.',
    toastConflict: 'Ce créneau n’est plus libre. Choisissez-en un autre.',
  },
  tutorActed: {
    title: 'Le tuteur a agi pour vous',
    settings: 'Régler',
    settingsLabel: 'Régler les automatismes',
    loading: 'Chargement des actions du tuteur…',
    errorTitle: 'Impossible de charger les actions du tuteur.',
    errorDescription: 'Vérifiez votre connexion puis réessayez.',
    retry: 'Réessayer',
    empty: 'Aucune action récente du tuteur.',
    undo: 'Annuler',
    confirm: 'Confirmer',
    decline: 'Pas maintenant',
    open: 'Ouvrir',
    weekCount: (count: number) =>
      count === 1 ? '1 action cette semaine' : `${String(count)} actions cette semaine`,
    announcements: {
      accepted: (summary: string) => `Action appliquée : ${summary}`,
      declined: (summary: string) => `Action refusée : ${summary}`,
      undone: (summary: string) => `Action annulée : ${summary}`,
    },
    toastError: 'L’action n’a pas pu être enregistrée. Réessayez.',
    toastConflict: 'Cette action a déjà changé d’état. La carte a été actualisée.',
    toastConsumed: 'Cette action a déjà été utilisée : elle ne peut plus être annulée.',
    kinds: {
      reprise: 'Reprise',
      micro_seance: 'Micro-séance',
      echauffement: 'Échauffement',
      remediation: 'Remédiation prête',
      jeu_lacune: 'Jeu choisi selon la lacune',
      questions_cartes: 'Question devenue carte',
      plafond_quiz: 'Quiz global lissé',
      sprint: 'Sprint planifié',
      bilan: 'Bilan de la semaine',
      pause: 'Mode pause',
    },
  },
  weeklyReview: {
    title: 'Bilan de la semaine',
    loading: 'Chargement du bilan de la semaine…',
    errorTitle: 'Impossible de charger le bilan de la semaine.',
    errorDescription: 'Vérifiez votre connexion puis réessayez.',
    retry: 'Réessayer',
    empty: 'Votre premier bilan arrivera à la fin de la semaine.',
    studyLabel: 'd’étude',
    retentionLabel: 'retenu à 1 mois',
    atRiskLabel: (count: number) => (count === 1 ? 'notion à risque' : 'notions à risque'),
    detail: 'Voir le détail',
    hide: 'Masquer le détail',
    availabilityQuestion: 'Vos disponibilités changent-elles ?',
    availabilityLink: 'Ajuster mon rythme',
    atRiskTitle: 'Notions à risque',
    noAtRisk: 'Aucune notion à risque cette semaine.',
    planTitle: 'Plan de la semaine prochaine',
    noPlan: 'Aucun créneau planifié pour la semaine prochaine.',
    planDay: (day: string, minutes: string) => `${day} · ${minutes}`,
    planTotal: (minutes: string) => `${minutes} prévues la semaine prochaine`,
    unavailable: 'Non disponible',
  },
  warmup: {
    title: (kind: string, time: string) => `Échauffement · avant votre ${kind} de ${time}`,
    subtitle: (count: number, minutes: number, scope: 'yesterday_prerequisites' | 'yesterday') =>
      `${String(count)} question${count === 1 ? '' : 's'} de rappel, ${String(minutes)} minute${minutes === 1 ? '' : 's'} : ${scope === 'yesterday' ? 'les notions vues la veille.' : 'la veille et les prérequis du chapitre.'}`,
    progress: (index: number, count: number) =>
      index < count ? `Question ${String(index + 1)} sur ${String(count)}` : 'Terminé',
    progressLabel: (index: number, count: number, state: string) =>
      `Progression de l’échauffement : ${String(Math.min(index, count))} sur ${String(count)} (${state})`,
    tagYesterday: 'Vu hier',
    tagPrerequisite: (moduleNumber: number) => `Prérequis · module ${String(moduleNumber)}`,
    reveal: 'Voir la réponse',
    knew: 'Je savais',
    review: 'À revoir',
    score: (knewCount: number, count: number) =>
      `Échauffement fait : ${String(knewCount)} sur ${String(count)}`,
    follow: (questions: readonly string[], kind: string, tonight: boolean): string => {
      if (questions.length === 0) {
        return kind === 'validation_quiz'
          ? 'Tout est là. Vous êtes prêt pour le quiz de validation.'
          : 'Tout est là. Vous êtes prêt pour la suite.';
      }
      const quoted = questions.map((question) => `« ${question} »`).join(', ');
      const subject = questions.length > 1 ? 'Ces notions repassent' : 'Cette notion repasse';
      return `À revoir : ${quoted}. ${subject} ${tonight ? 'dans le quiz global de ce soir.' : 'dans le prochain quiz global.'}`;
    },
    next: (kind: string): string => {
      switch (kind) {
        case 'validation_quiz':
          return 'Passer au quiz de validation';
        case 'course':
          return 'Ouvrir le cours';
        case 'exercise':
          return 'Ouvrir l’exercice';
        case 'mock_exam':
          return 'Commencer l’examen blanc';
        default:
          return 'Ouvrir le module';
      }
    },
    restart: 'Recommencer',
    loading: 'Chargement de l’échauffement',
    error: 'Impossible de charger l’échauffement.',
    retry: 'Réessayer',
    saveError: 'La réponse n’a pas pu être enregistrée. Réessayez.',
    conflict: 'Cette question a déjà été répondue : l’échauffement affiche la réponse enregistrée.',
  },
  formations: {
    title: 'Mes formations',
    tabLabel: 'Mes formations',
    ongoing: (count: number) => `En cours · ${String(count)}`,
    completed: (count: number) => `Terminées · ${String(count)}`,
    tableLabel: 'Mes formations',
    columns: {
      formation: 'Formation',
      progress: 'Progression',
      module: 'Module en cours',
      next: 'Prochaine activité',
      end: 'Fin prévue',
      action: 'Action',
      result: 'Résultat',
      memory: 'Mémorisation',
      revisions: 'Révisions dues',
      completedOn: 'Terminée le',
    },
    progress: (percent: number, position: number | null, count: number) =>
      position === null
        ? `${String(percent)} %`
        : `Module ${String(position)} sur ${String(count)}`,
    programmeToValidate: 'Programme à valider',
    cadrage: 'Cadrage en cours',
    paused: 'En pause',
    noModule: '—',
    emptyOngoingTitle: 'Aucune formation en cours',
    emptyOngoingDescription:
      'Dites ce que vous voulez apprendre : le tuteur conçoit votre programme.',
    createFormation: 'Créer une formation',
    emptyCompleted: "Aucune formation terminée pour l'instant.",
    completedHint:
      'Au bilan final, vous choisissez de garder un entretien de mémoire léger, ou d’arrêter les révisions.',
    validated: (score: number | null) =>
      score === null ? 'Validée' : `Validée · ${String(score)} %`,
    retained: 'notions retenues à 1 mois',
    measurementComing: 'mesure à venir',
    dueToday: (count: number) =>
      count === 0 ? "Aucune aujourd'hui" : `${String(count)} notions aujourd'hui`,
    memoryInterview: 'entretien de mémoire',
    stopped: 'Entretien arrêté',
    stoppedDetail: 'à votre demande, au bilan final',
    reportToDo: 'Bilan à faire',
    reportDetail: 'choisissez au bilan final',
    weeks: (weeks: number) => `${String(weeks)} semaines`,
    revision: 'Réviser',
    viewReport: 'Voir le bilan',
    ringLabel: (title: string, percent: number) => `Avancement de ${title} : ${String(percent)} %`,
  },
  slots: {
    contributions: 'Apports',
    course: 'Cours',
    exercise: 'Exercice',
    validation_quiz: 'Quiz de validation',
    global_quiz: 'Quiz global',
    revision: 'Révision',
    sprint: 'Sprint',
    micro_session: 'Micro-séance',
    warmup: 'Échauffement',
    mock_exam: 'Examen blanc',
    buffer: 'Marge de rattrapage',
    weekly_review: 'Bilan',
  },
  loading: 'Chargement de votre journée…',
  errorTitle: 'Impossible de charger votre journée.',
  retry: 'Réessayer',
  networkLost: 'Connexion perdue : les données peuvent être anciennes.',
} as const;

export const fr = { home } as const;
