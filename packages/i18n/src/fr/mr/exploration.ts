// Zone D — Exploration : lacunes, carte des notions et mode cerveau, recherche.
// Propriétaire : agent D. Registre : vouvoiement (espace « carte / lacunes / recherche » du web).
//
// Les libellés partagés du web restent la source (`fr.gaps`, `fr.notionGraph`, `fr.search`) : ce
// fichier ne porte que ce qui est propre aux écrans mobiles du rattrapage, pour ne pas dupliquer
// une phrase que le web affiche déjà.
export const mrExploration = {
  common: {
    back: 'Retour',
    errorTitle: 'Impossible de charger cet écran',
    errorDescription: 'Vérifiez votre connexion puis réessayez.',
    retry: 'Réessayer',
  },
  lacunes: {
    title: 'Mes lacunes',
    eyebrow: 'Profil · Apprentissage',
    listLabel: 'Lacunes ouvertes',
    filtersLabel: 'Filtrer par nature de lacune',
    moduleLine: (position: number, title: string) => `Module ${String(position)} · ${title}`,
    masteryLine: (mastery: number, threshold: number) =>
      `Maîtrise ${String(Math.round(mastery))} % · seuil ${String(threshold)} %`,
    masteryAnnouncement: (notion: string, mastery: number) =>
      `Maîtrise de ${notion} : ${String(Math.round(mastery))} %`,
    count: (count: number) => (count === 1 ? '1 lacune' : `${String(count)} lacunes`),
    nextReview: (date: string) => `Prochaine révision : ${date}`,
    noFormationTitle: 'Aucune formation en cours',
    noFormationDescription:
      'Vos lacunes apparaissent ici dès qu’une formation est active dans votre programme.',
  },
  carte: {
    title: 'Carte des notions',
    cerveau: 'Mode esprit',
    eyebrow: 'Programme',
    viewLabel: 'Vue de la carte',
    views: { grid: 'Grille', brain: 'Esprit' },
    gridLabel: 'Carte des notions par module',
    legendLabel: 'Légende de la carte',
    legend: {
      mastered: 'Maîtrisée',
      inProgress: 'En cours',
      fragile: 'Fragile',
      upcoming: 'À venir',
    },
    cellLabel: (label: string, status: string) => `${label}, ${status}`,
    moduleScore: (mastered: number, total: number) => `${String(mastered)}/${String(total)}`,
    brain: {
      label: 'Réseau des notions et de leurs liens',
      hint: 'Touchez une notion pour la détailler. Pincez ou utilisez les boutons pour zoomer et vous déplacer.',
      zoomIn: 'Zoomer',
      zoomOut: 'Dézoomer',
      reset: 'Recentrer le réseau',
      showList: 'Afficher la liste accessible',
      hideList: 'Masquer la liste accessible',
      listLabel: 'Liste accessible des nœuds et relations',
      listHint: 'Alternative textuelle au réseau : chaque notion annonce ses liens.',
      relations: 'Relations',
      noRelations: 'Aucune relation',
      emptySelection: 'Touchez une notion de la carte pour voir son détail.',
      relation: (from: string, kind: string, to: string) => `${from} ${kind} ${to}`,
      relationKinds: {
        formation: 'appartient à',
        contains: 'contient',
        prerequisite: 'prépare',
        confusion: 'se confond avec',
        tutor: 'reliée par le tuteur à',
        source: 's’appuie sur',
      },
    },
    detail: {
      label: 'Détail de la notion',
      close: 'Fermer le détail',
      moduleLine: (position: number, title: string) => `Module ${String(position)} · ${title}`,
      mastery: (value: number) => `Maîtrise : ${String(Math.round(value))} %`,
      notSeen: 'Pas encore vue',
      train: 'Réviser · 3 min',
      course: 'Revoir dans le cours',
      gap: 'Voir la lacune',
      relationCount: (count: number) => (count === 1 ? '1 lien' : `${String(count)} liens`),
      kind: {
        formation: 'Formation',
        module: 'Module',
        notion: 'Notion',
        source: 'Votre apport',
      },
    },
  },
  recherche: {
    title: 'Recherche',
    eyebrow: 'Recherche globale',
    fieldLabel: 'Rechercher dans vos cours, notions et formations',
    cancel: 'Annuler',
    filtersLabel: 'Filtrer les résultats',
    filters: { all: 'Tout', notion: 'Notions', chapter: 'Chapitres', formation: 'Formations' },
    groups: { notion: 'Notions', chapter: 'Chapitres', formation: 'Formations' },
    groupTotal: (shown: number, total: number) =>
      shown >= total
        ? total === 1
          ? '1 résultat'
          : `${String(total)} résultats`
        : `${String(shown)} sur ${String(total)}`,
  },
} as const;