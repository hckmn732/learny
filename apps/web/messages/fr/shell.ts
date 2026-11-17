export const shell = {
  sidebar: {
    logoLabel: 'Learny, accueil',
    navLabel: 'Navigation principale',
    formationNavLabel: 'Formation en cours',
    home: 'Accueil',
    agenda: 'Agenda',
    currentFormation: 'Formation en cours',
    changeFormation: 'Changer de formation',
    chooseFormation: 'Choisir la formation en cours',
    paused: 'En pause',
    programme: 'Programme',
    notionMap: 'Carte des notions',
    globalQuiz: 'Quiz global',
    gaps: 'Mes lacunes',
    hide: 'Masquer le menu',
    show: 'Afficher le menu',
    closeOverlay: 'Fermer le menu',
    series: 'Série',
    streakDays: (days: number) => (days === 1 ? '1 jour' : `${String(days)} jours`),
    regularity: 'Régularité sur les 14 derniers jours',
    streakDone: 'activité faite',
    streakNone: 'pas d’activité',
    streakNeutral: 'jour neutre',
    noFormationTitle: 'Aucune formation en cours',
    noFormationDescription:
      'Dites ce que vous voulez apprendre : le tuteur conçoit votre programme.',
    createFormation: 'Créer une formation',
    loading: 'Chargement du menu…',
    errorTitle: 'Impossible de charger le menu.',
    retry: 'Réessayer',
    moduleOf: (position: number, total: number) =>
      `Module ${String(position)} sur ${String(total)}`,
    progressLabel: (title: string) => `Avancement de ${title}`,
    quizCountLabel: (count: number) =>
      count === 1 ? '1 notion à revoir' : `${String(count)} notions à revoir`,
    gapsCountLabel: (count: number) => (count === 1 ? '1 lacune' : `${String(count)} lacunes`),
    noOpenModule: 'Aucun module en cours',
    programmeToValidate: 'Programme à valider',
    formationManagement: {
      changeFormation: 'Changer de formation',
      dialogTitle: 'Changer de formation',
      dialogDescription:
        'Choisissez la formation à consulter, mettez-en une en pause ou reprenez-la.',
      activeSection: (count: number) => (count === 1 ? 'Active · 1' : `Actives · ${String(count)}`),
      pausedSection: (count: number) =>
        count === 1 ? 'En pause · 1' : `En pause · ${String(count)}`,
      current: 'Formation courante',
      paused: 'En pause',
      select: (title: string) => `Choisir ${title}`,
      pause: 'Mettre en pause',
      pauseLabel: (title: string) => `Mettre en pause ${title}`,
      resume: 'Reprendre',
      resumeLabel: (title: string) => `Reprendre ${title}`,
      archive: 'Archiver',
      archiveLabel: (title: string) => `Archiver ${title}`,
      archiveTitle: (title: string) => `Archiver « ${title} » ?`,
      archiveDescription:
        'La formation quitte la liste active. Son historique et ses tentatives restent accessibles.',
      archiveConfirm: 'Archiver',
      cancel: 'Annuler',
      pending: 'Enregistrement…',
      pausedToast: (title: string) => `« ${title} » est en pause.`,
      resumedToast: (title: string) => `« ${title} » a repris.`,
      archivedToast: (title: string) => `« ${title} » est archivée.`,
      currentToast: (title: string) => `« ${title} » est la formation courante.`,
      limitTitle: 'Trois formations actives au plus',
      limitDescription: (title: string) =>
        `Pour reprendre « ${title} », mettez une formation active en pause.`,
      limitChoose: 'Formation à mettre en pause',
      limitConfirm: 'Mettre en pause et reprendre',
      limitPending: 'Reprise…',
      limitEmpty: 'Aucune formation active à mettre en pause.',
      errorTitle: 'L’action n’a pas pu aboutir.',
      errorDetail: 'Vérifiez votre connexion puis réessayez.',
      emptyActive: 'Aucune formation active.',
      close: 'Fermer',
    },
  },
  skipToContent: 'Aller au contenu principal',
  header: {
    searchLabel: 'Rechercher',
    searchPlaceholder: 'Rechercher une notion, un cours, une formation…',
    notificationsLabel: (count: number) =>
      count === 0
        ? 'Notifications, aucune non lue'
        : count === 1
          ? 'Notifications, 1 non lue'
          : `Notifications, ${String(count)} non lues`,
    accountButton: 'Mon compte',
    accountMenuLabel: 'Mon compte',
    accountFallback: 'Apprenant',
    activeFormations: (count: number) =>
      count === 0
        ? 'Aucune formation en cours'
        : count === 1
          ? '1 formation en cours'
          : `${String(count)} formations en cours`,
    loadingAccount: 'Chargement du compte…',
    accountError: 'Impossible de charger le compte.',
    retry: 'Réessayer',
    settings: 'Paramètres',
    pause: 'Mettre en pause',
    signOut: 'Se déconnecter',
    signingOut: 'Déconnexion…',
    signOutError: 'La déconnexion a échoué. Vérifiez votre connexion puis réessayez.',
  },
  notifications: {
    panelTitle: 'Notifications',
    readAll: 'Tout marquer comme lu',
    readAllDone: 'Tout est lu',
    filtersLabel: 'Filtrer les notifications',
    filterAll: 'Toutes',
    filterUnread: 'Non lues',
    groups: {
      today: 'Aujourd’hui',
      yesterday: 'Hier',
      earlier: 'Plus tôt',
    },
    unread: 'Non lue',
    loading: 'Chargement des notifications…',
    errorTitle: 'Impossible de charger les notifications.',
    errorDescription: 'Vérifiez votre connexion puis réessayez.',
    retry: 'Réessayer',
    readError: 'Impossible de marquer la notification comme lue. Elle reste non lue.',
    readAllError: 'Impossible de tout marquer comme lu.',
    emptyAll: 'Aucune notification pour le moment. Les prochains rappels arriveront ici.',
    emptyUnread: 'Vous avez tout lu. Les prochains rappels arriveront ici.',
    manage: 'Gérer les notifications',
    emailNote: 'Rappels aussi envoyés par e-mail',
    announcement: (count: number) =>
      count === 0
        ? 'Aucune notification non lue.'
        : count === 1
          ? '1 notification non lue.'
          : `${String(count)} notifications non lues.`,
    readAnnouncement: (count: number) =>
      count === 0
        ? 'Notification marquée comme lue. Aucune notification non lue.'
        : count === 1
          ? 'Notification marquée comme lue. 1 notification non lue.'
          : `Notification marquée comme lue. ${String(count)} notifications non lues.`,
    allReadAnnouncement: 'Toutes les notifications sont marquées comme lues.',
  },
  placeholder: {
    accueilTitle: 'Accueil',
    accueilBody: 'L’accueil complet arrive avec SPEC-603.',
    programmeTitle: 'Programme',
    programmeBody: 'Le programme complet arrive avec SPEC-606.',
  },
} as const;

export const fr = { shell } as const;
