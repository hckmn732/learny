export const globalQuiz = {
  title: 'Quiz global',
  subtitle: (formation: string, day: string) => `${formation} · session du ${day}`,
  pills: {
    notions: (count: number) => (count === 1 ? '1 notion' : `${String(count)} notions`),
    duration: (minutes: number) => `≈ ${String(minutes)} min`,
    durationLabel: (minutes: number) =>
      `Durée estimée : environ ${String(minutes)} minute${minutes === 1 ? '' : 's'}`,
  },
  modes: {
    label: 'Durée de la séance',
    full: (minutes: number) => `Séance complète · ${String(minutes)} min`,
    micro: (minutes: number) => `Micro-séance · ${String(minutes)} min`,
    microAvailableLater: 'La micro-séance arrive dans une prochaine version.',
  },
  micro: {
    /** SPEC-703 EF-3 — note shown while the micro-session of the day loads. */
    note: (minutes: number) =>
      minutes >= 10
        ? 'Version courte de secours : deux cartes de rappel et une question. Elle garde le rythme et la série les jours chargés.'
        : 'Version courte de secours : une carte de rappel et une question. Elle garde le rythme et la série les jours chargés.',
    converted: 'Micro-séance chargée',
    restored: 'Séance complète chargée',
    loading: 'Chargement de la micro-séance…',
  },
  adjust: 'Régler',
  progress: {
    label: (position: number, total: number) => `Jeu ${String(position)} sur ${String(total)}`,
    done: 'Terminé',
    aria: (position: number, total: number) =>
      `Progression de la session : jeu ${String(position)} sur ${String(total)}`,
  },
  rail: {
    label: 'Jeux de la session',
    status: {
      done: 'Fait',
      current: 'En cours',
      upcoming: 'À venir',
    },
  },
  rationale: {
    title: 'Réglé par le tuteur',
    gap: 'Lacune en priorité',
    load: 'Charge lissée',
    modules: 'Modules mêlés',
    /** SPEC-718 — cap and reversal of the smoothed day. */
    cap: (minutes: number) => `Durée maximale : ${String(minutes)} min par jour.`,
    undoSmoothing: 'Annuler le lissage',
    undoPending: 'Annulation…',
  },
  game: {
    skip: 'Passer',
    next: 'Suivant',
    finish: 'Terminer la session',
    techLabel: (tech: string) => `Technique : ${tech}`,
    readOnly: 'Ce jeu sera jouable dans une prochaine version.',
    skipped: 'Jeu passé',
    correct: 'Réponse enregistrée.',
    wrong: 'Réponse enregistrée.',
    answerPending: 'Enregistrement…',
  },
  games: {
    matching: {
      instruction: 'Touchez une notion, puis la définition qui lui correspond.',
      verify: 'Vérifier',
      reset: 'Recommencer',
      expected: (term: string) => `Attendu : ${term}`,
      associated: (definition: string, term: number) =>
        `${definition}, associée au terme ${String(term)}`,
      notAssociated: (definition: string) => `${definition}, non associée`,
    },
    ordering: {
      up: 'Monter',
      down: 'Descendre',
      verify: 'Vérifier l’ordre',
      expectedPosition: (position: number) => `Position attendue : ${String(position)}`,
    },
    categorization: {
      verify: 'Vérifier le classement',
      expected: (category: string) => `Attendu : ${category}`,
    },
    cloze: {
      instruction: 'Complétez de tête, sans liste de choix.',
      verify: 'Vérifier',
      labels: [
        'Premier mot manquant',
        'Second mot manquant',
        'Troisième mot manquant',
      ] as readonly string[],
      numbered: (index: number) => `Mot manquant n°${String(index)}`,
      expectedMultiple: 'Réponses attendues :',
      expectedSingle: 'Réponse attendue :',
      and: ' et ',
    },
    correct: 'Juste',
    wrong: 'Faux',
    explanation: 'Explication',
    unavailable: 'Ce jeu n’est plus disponible.',
  },
  end: {
    badge: 'Session terminée',
    title: (notions: number, minutes: number) =>
      `${String(notions)} notion${notions === 1 ? '' : 's'} revue${notions === 1 ? '' : 's'} en ${String(minutes)} minute${minutes === 1 ? '' : 's'}`,
    okLabel: 'notions réussies, espacées davantage',
    soonLabel: 'reviendront plus tôt',
    streak: (days: number) => `${String(days)} j`,
    streakLabel: 'de série',
    next: (day: string, time: string) => `Prochaine session : ${day}, ${time}.`,
    noNext: 'Aucune session planifiée pour l’instant.',
    home: "Retour à l'accueil",
  },
  empty: {
    title: 'Rien à revoir aujourd’hui',
    description:
      'Toutes vos notions sont à jour. Le prochain quiz global sera prêt dès que des notions seront dues.',
    action: "Retour à l'accueil",
  },
  paused: {
    title: 'Formation en pause',
    description: 'Le quiz global reprendra quand vous relancerez cette formation.',
  },
  loading: 'Chargement de la session…',
  errorTitle: 'Impossible de charger le quiz global.',
  retry: 'Réessayer',
  answerError: 'Votre réponse n’a pas pu être enregistrée. Réessayez.',
  completeError: 'La session n’a pas pu être terminée. Réessayez.',
} as const;

export const fr = { globalQuiz } as const;
