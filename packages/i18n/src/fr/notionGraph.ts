export const notionGraph = {
  title: 'Carte des notions',
  statsLine: (notions: number, links: number, modules: number) =>
    `${String(notions)} notions · ${String(links)} liens · ${String(modules)} modules`,
  colorsLabel: 'Couleurs',
  modes: {
    module: 'Par module',
    mastery: 'Par maîtrise',
  },
  search: {
    label: 'Chercher une notion',
    placeholder: 'Chercher une notion…',
    resultsLabel: 'Notions trouvées',
    noResults: 'Aucune notion ne correspond.',
    hint: 'Entrée sélectionne et centre le premier résultat.',
  },
  filters: {
    label: 'Éléments affichés',
    modules: 'Modules',
    upcoming: 'Notions à venir',
    sources: 'Mes apports',
  },
  graph: {
    label: 'Graphe des notions',
    ariaLabel:
      'Graphe des notions de la formation. Utilisez la recherche ou la liste accessible pour choisir une notion.',
    hint: 'Glisser pour déplacer · molette pour zoomer · cliquer une notion pour la détailler',
    zoomIn: 'Zoomer',
    zoomOut: 'Dézoomer',
    recenter: 'Recentrer la carte',
    nodeLabel: (label: string, kind: string) => `${label}, ${kind}`,
    selected: (label: string) => `Notion sélectionnée : ${label}`,
    moved: (label: string) => `${label} déplacée.`,
    empty: 'Aucune notion à afficher pour le moment.',
  },
  legend: {
    label: 'Légende de la carte',
    module: (position: number, label: string) => `M${String(position)} · ${label}`,
    mastered: 'Maîtrisée',
    toConsolidate: 'À consolider',
    upcoming: 'Pas encore vue',
    confusion: 'Se confondent',
    tutor: 'Lien repéré par le tuteur',
    source: 'Vos apports',
  },
  detail: {
    label: 'Détail de la carte',
    close: 'Fermer le détail',
    emptyTitle: 'Comment lire la carte',
    emptyBody1:
      'Chaque point est une notion de la formation. Un trait relie une notion à celles qui la préparent. Les grands points sont les modules ; les points creux, vos apports.',
    emptyBody2:
      'Le tuteur ajoute les liens qu’il repère entre modules, et marque en orange les notions que vous confondez.',
    gapsTitle: (count: number) => `À consolider · ${String(count)}`,
    noGaps: 'Aucune notion à consolider.',
    masteredCount: (count: number) => `${String(count)} maîtrisées`,
    upcomingCount: (count: number) => `${String(count)} à venir`,
    mastery: 'Maîtrise',
    masteryLabel: (notion: string, mastery: string) => `Maîtrise de ${notion} : ${mastery} %`,
    status: {
      mastered: 'Maîtrisée',
      toConsolidate: 'À consolider',
      upcoming: 'Pas encore vue',
      upcomingModule: (module: number) =>
        `Pas encore vue : elle arrive avec le module ${String(module)}.`,
    },
    notSeen: (module: number) => `Pas encore vue : elle arrive avec le module ${String(module)}.`,
    definitionFallback: (module: number, title: string) =>
      `Notion du module ${String(module)}, ${title.toLocaleLowerCase('fr-FR')}.`,
    kind: {
      notion: (module: number, title: string) => `Module ${String(module)} · ${title}`,
      module: (position: number) => `Module ${String(position)}`,
      source: 'Votre apport',
      formation: 'Formation',
    },
    groups: {
      dependsOn: 'S’appuie sur',
      prepares: 'Prépare',
      confusion: 'Se confond avec',
      tutor: 'Lien repéré par le tuteur',
      sources: 'Dans vos apports',
      moduleNotions: 'Notions du module',
      fedNotions: 'Notions alimentées',
      formationModules: 'Modules',
    },
    moduleSummary: (notions: number, mastered: number, gaps: number) =>
      `${String(notions)} notions. ${String(mastered)} maîtrisées, ${String(gaps)} à consolider.`,
    moduleNotStarted: 'Pas encore commencé.',
    sourceDescription: 'Le tuteur s’en sert pour rédiger le cours et le cite en source.',
    formationSummary: (notions: number, modules: number) =>
      `${String(notions)} notions réparties en ${String(modules)} modules.`,
    actions: {
      course: 'Revoir dans le cours',
      train: 'S’entraîner',
      gap: 'Voir la lacune',
      programme: 'Voir dans le programme',
    },
    openCourse: (notion: string) => `Revoir ${notion} dans le cours`,
    openTraining: (notion: string) => `S’entraîner sur ${notion}`,
    openGap: (notion: string) => `Voir la lacune de ${notion}`,
    related: (label: string) => `Sélectionner ${label}`,
    emptyModule: 'Aucune notion dans ce module.',
  },
  list: {
    title: 'Liste accessible des nœuds et relations',
    description:
      'Alternative textuelle au graphe : parcourez les notions au clavier, puis ouvrez leur détail.',
    label: 'Nœuds et relations du graphe',
    item: (label: string, kind: string) => `${label} (${kind})`,
    relations: (count: number) => (count === 1 ? '1 relation' : `${String(count)} relations`),
    noRelations: 'Aucune relation',
  },
  loading: 'Chargement de la carte des notions…',
  empty: {
    title: 'Aucune notion dans cette formation',
    description:
      'Le programme est encore vide. Ajoutez un module et ses notions pour voir apparaître la carte.',
  },
  errorTitle: 'Impossible de charger la carte des notions',
  errorDescription: 'Vérifiez votre connexion puis réessayez.',
  retry: 'Réessayer',
  invalidId: 'Cet identifiant de formation n’est pas valide.',
} as const;

export const fr = { notionGraph } as const;
