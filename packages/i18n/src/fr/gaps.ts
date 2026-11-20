export const gaps = {
  title: 'Mes lacunes',
  trainAll: 'S’entraîner sur mes lacunes',
  stats: {
    notionCount: (count: number) => (count === 1 ? '1 notion' : `${String(count)} notions`),
    openLabel: (modules: string | null) =>
      modules === null ? 'aucune notion à consolider' : `à consolider dans ${modules}`,
    masteredLabel: (modules: string | null) =>
      modules === null ? 'maîtrisées pour l’instant' : `maîtrisées dans ${modules}`,
    nextLabel: 'prochaine révision, dans le quiz global',
    nextNone: 'aucune révision planifiée pour le moment',
    nextNow: 'maintenant',
  },
  filters: {
    label: 'Filtrer par nature de lacune',
    all: 'Toutes',
    forgetting: 'Oubli',
    confusion: 'Confusion',
    misunderstanding: 'Incompréhension',
    application: 'Difficulté d’application',
    countLabel: (label: string, count: number) =>
      count === 1 ? `${label}, 1 lacune` : `${label}, ${String(count)} lacunes`,
  },
  card: {
    mastery: 'Maîtrise',
    masteryLabel: (notion: string, mastery: string) => `Maîtrise de ${notion} : ${mastery} %`,
    threshold: (threshold: number) => `Seuil de maîtrise : ${String(threshold)} %`,
    revealedBy: 'Ce qui l’a révélée :',
    revealedFallback: (date: string) => `Repérée le ${date}.`,
    tutorProposes: 'Le tuteur propose :',
    train: 'S’entraîner',
    course: 'Revoir dans le cours',
    courseUnavailable: 'Revoir dans le cours',
    courseUnavailableHint: 'Le cours de ce module n’est pas encore disponible.',
    trainingLabels: {
      quiz: 'Ouvrir le quiz global ciblé',
      exercise: 'Ouvrir l’exercice pratique',
    },
    openCourse: (notion: string) => `Revoir ${notion} dans le cours`,
    recommendations: {
      global_quiz: 'une révision dans le quiz global, en priorité.',
      confrontation: (notion: string, other: string) =>
        `une question qui oppose ${notion} et ${other}.`,
      alternative_explanation:
        'une nouvelle explication, sous un autre angle, avant la prochaine tentative.',
      practice_exercise: 'un exercice pratique pour appliquer la notion.',
    },
  },
  note: 'Une lacune disparaît quand la notion est réussie plusieurs fois, à des dates espacées. En attendant, elle passe en priorité dans le quiz global et dans vos prochaines tentatives.',
  listLabel: 'Lacunes ouvertes',
  empty: {
    title: 'Aucune lacune ouverte',
    description:
      'Toutes vos notions sont au-dessus du seuil de maîtrise. Continuez vos révisions : le tuteur surveille les oublis et les confusions pour vous.',
  },
  invalidNature: 'Ce filtre n’existe pas. Toutes les lacunes sont affichées.',
  loading: 'Chargement de vos lacunes…',
  errorTitle: 'Impossible de charger vos lacunes',
  errorDescription: 'Vérifiez votre connexion puis réessayez.',
  retry: 'Réessayer',
} as const;

export const fr = { gaps } as const;
