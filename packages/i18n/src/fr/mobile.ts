// Messages propres à l'application mobile : espace `mobile` de `@learny/i18n` (canevas § 2,
// ADR-3005 § 3). Textes vus par l'utilisateur, en français (BR-ACC-06), ton neutre vouvoiement.
export const mobile = {
  sdd: {
    spec3001: {
      eyebrow: 'Démonstration SDD',
      title: 'SPEC-3001 · socle mobile',
      versionLabel: 'Version de l’application',
      runtimeLabel: 'Version du runtime',
      apiLabel: 'URL de l’API',
      clockLabel: 'Horloge (Europe/Paris)',
      healthLabel: 'Santé de l’API',
      healthChecking: 'Vérification…',
      healthOk: 'API joignable',
      healthUnreachable: 'API injoignable',
      healthCodeLabel: 'Code',
      platformLabel: 'Plateforme',
      footer: 'Page de démonstration visible seulement si EXPO_PUBLIC_ENABLE_SDD_PAGES=1.',
    },
    // SPEC-3003 EF-9, § 10 — page `/_dev/sdd/SPEC-3003`.
    spec3003: {
      eyebrow: 'Démonstration SDD',
      title: 'SPEC-3003 · client d’API, session et cache',
      sessionLabel: 'Session',
      sessionLoading: 'Restauration de la session…',
      sessionSignedIn: 'Connecté',
      sessionSignedOut: 'Déconnecté',
      sessionSigningIn: 'Connexion…',
      accountLabel: 'Compte de démonstration',
      firstNameLabel: 'Prénom lu sur /me',
      streamLabel: 'Flux SSE de démonstration',
      streamIdle: 'En attente du flux…',
      cacheLabel: 'Cache',
      cacheEntries: '{count} requête(s) en mémoire',
      cacheRestored: 'restaurée depuis le stockage chiffré',
      cacheCold: 'cache vide',
      offlineToggle: 'Simuler la coupure réseau',
      onlineToggle: 'Rétablir le réseau',
      reload: 'Recharger /me',
      footer:
        'Page de démonstration : le mot de passe du compte de démonstration vient de l’environnement du build et n’est jamais affiché.',
    },
  },
  // SPEC-3101 — connexion, inscription et lien magique (libellés propres au mobile ; les
  // libellés identiques au web sont importés de `fr.auth`, canevas § 2).
  auth: {
    titleLogin: 'Reprenez là où vous en êtes.',
    titleSignup: 'Créez votre espace d’apprentissage.',
    ledeLogin:
      'Votre tuteur a préparé la séance de 14:00 : 10 questions, 40 minutes, seuil de validation 80 %.',
    ledeSignup:
      'Trois minutes pour poser votre rythme, votre objectif et le tuteur qui vous accompagne.',
    modeLabel: 'Mode de connexion',
    modeLogin: 'Se connecter',
    modeSignup: 'Créer un compte',
    sessionSecure: 'Session sécurisée',
    passwordMin: '12 caractères minimum',
    forgot: 'Mot de passe oublié ?',
    divider: 'ou',
    showPassword: 'Afficher le mot de passe',
    submitBusyLogin: 'Connexion…',
    submitBusySignup: 'Création…',
    demoSignIn: 'Connexion de démonstration',
    hidePassword: 'Masquer le mot de passe',
    strengthLabel: 'Solidité du mot de passe',
    termsLabel: 'J’accepte les conditions d’utilisation et la politique de confidentialité',
    termsHint: 'Obligatoire pour créer votre compte.',
    magic: {
      title: 'Recevoir un lien de connexion',
      intro: 'Sans mot de passe : un lien valable 1 heure, envoyé par e-mail.',
      send: 'Recevoir mon lien',
      sending: 'Envoi…',
      sent: 'Si un compte existe pour cette adresse, un lien vient d’être envoyé.',
    },
    verify: {
      resent: 'Nouveau lien envoyé. Il reste valable 1 heure.',
      resend: 'Renvoyer le lien',
      countdown: (seconds: number) => `Renvoyer le lien (dans ${String(seconds)} s)`,
      text: (email: string) =>
        `Nous avons envoyé un lien de connexion à ${email}. Ouvrez-le sur cet appareil pour continuer.`,
      back: 'Revenir à la connexion',
    },
    callback: {
      opening: 'Ouverture de votre session…',
      invalid: 'Ce lien n’est plus valide. Demandez-en un nouveau.',
      askNew: 'Recevoir un nouveau lien',
      back: 'Revenir à la connexion',
    },
    legalSheet: {
      title: 'Nouvelles conditions d’utilisation',
      body: 'Une nouvelle version des conditions d’utilisation et de la politique de confidentialité est en vigueur. Acceptez-la pour continuer.',
      accept: 'J’accepte',
      later: 'Plus tard',
      recorded: 'Acceptation enregistrée.',
    },
    // SPEC-3101 EF-8 — page web `/auth/mobile` qui rend le lien à l’application.
    bridge: {
      eyebrow: 'Learny',
      title: 'Ouverture de l’application…',
      body: 'Si rien ne se passe, ouvrez le lien ci-dessous : il termine la connexion dans l’application.',
      open: 'Ouvrir Learny',
    },
    shell: {
      title: 'Vous êtes connecté',
      body: 'La coquille de l’application (onglets Aujourd’hui, Programme, Réviser, Agenda, Profil) arrive avec SPEC-3102.',
      placeholder: 'Coquille à venir · SPEC-3102',
    },
  },
  config: {
    title: 'Configuration invalide',
    intro:
      'L’application ne peut pas démarrer : la configuration publique est incomplète ou mal formée. Aucune valeur n’est affichée, seulement le nom des clés.',
    missingTitle: 'Clés manquantes',
    invalidTitle: 'Clés invalides',
  },
  home: {
    placeholderTitle: 'Learny',
    placeholderBody:
      'Le socle mobile est installé. Activez les pages de démonstration SDD pour ouvrir la page de SPEC-3001.',
  },
  // SPEC-3003 EF-3 — session expirée et actions de connexion.
  session: {
    expired: 'Votre session a expiré. Reconnectez-vous.',
    loading: 'Restauration de la session…',
    signedOut: 'Déconnecté',
    signedIn: 'Connecté',
    signingIn: 'Connexion…',
    signOut: 'Se déconnecter',
    signIn: 'Se connecter',
  },
  // SPEC-3003 EF-5 — bandeau hors ligne.
  offline: {
    banner: 'Hors ligne · affichage des données enregistrées',
  },
  // SPEC-3003 EF-7 — messages français des codes d'erreur de l'API.
  errors: {
    generic: 'Une erreur est survenue. Réessayez.',
    rateLimited: 'Trop de requêtes. Réessayez dans {seconds} s.',
    network: 'Le serveur est injoignable. Vérifiez votre connexion.',
    unauthorized: 'Votre session a expiré. Reconnectez-vous.',
    forbidden: 'Accès refusé.',
    notFound: 'Élément introuvable.',
    validationFailed: 'Certaines données sont invalides.',
    conflict: 'Conflit : réessayez.',
    serviceUnavailable: 'Service momentanément indisponible.',
  },
  ui: {
    retry: 'Réessayer',
    close: 'Fermer',
    offlineTitle: 'Hors ligne',
    offlineBody: 'Les données affichées viennent du cache.',
    errorTitle: 'Une erreur est survenue',
    errorBody: 'Réessayez dans un instant.',
    gallery: {
      eyebrow: 'Démonstration SDD',
      title: 'Galerie des composants',
      intro: 'Chaque composant est présenté dans tous ses états, avec la plateforme réelle.',
      platform: 'Plateforme',
      platformNote: 'Sélecteur simulé désactivé : la plateforme réelle s’applique.',
      sections: {
        tokens: 'Jetons',
        buttons: 'Boutons',
        cards: 'Cartes et puces',
        controls: 'Contrôles',
        lists: 'Listes',
        overlays: 'Feuilles et retours',
        states: 'États',
      },
      tokens: {
        colors: 'Couleurs',
        typography: 'Typographie',
        radii: 'Rayons',
        spacing: 'Espacements',
      },
      labels: {
        primary: 'Commencer la séance',
        secondary: 'Voir le programme',
        outline: 'Plus tard',
        text: 'Annuler',
        loading: 'Chargement…',
        small: 'Tout lire',
        disabledButton: 'Indisponible',
        chipNeutral: 'Neutre',
        chipLime: 'En cours',
        chipIndigo: 'Tuteur',
        chipGreen: 'Validé',
        chipOrange: '4 lacunes',
        chipOutline: 'Filtrer',
        statStreak: 'Série',
        statRetention: 'Rétention',
        statGaps: 'Lacunes',
        progressLabel: 'Progression du chapitre',
        segmentsLabel: 'Questions répondues',
        segmentedLabel: 'Vue du programme',
        day: 'Jour',
        week: 'Semaine',
        month: 'Mois',
        switchLabel: 'Notifications',
        switchDescription: 'Rappels de séance et bilan hebdomadaire',
        switchOn: 'Activé',
        switchOff: 'Désactivé',
        rowCourse: 'Comptabilité générale',
        rowCourseSub: 'Module 3 · 4 chapitres',
        groupHeader: 'Réglages',
        toast: 'Séance reportée à demain 9:00.',
        toastAction: 'Annuler',
        sheetTitle: 'Fiche de la série',
        sheetBody: '12 jours d’affilée, dont 4 cette semaine.',
        emptyTitle: 'Aucune activité',
        emptyBody: 'Votre agenda est libre cette semaine.',
        emptyAction: 'Ajouter une séance',
        errorRetry: 'Réessayer',
        skeleton: 'Chargement du programme',
        avatar: 'Alex Perrin',
        badge: '3 notifications non lues',
        fab: 'Nouvelle formation',
      },
      actions: {
        showToast: 'Afficher un toast',
        openSheet: 'Ouvrir la feuille',
      },
    },
  },
  // SPEC-3102 — coquille, onglets natifs, compte et centre de notifications. Les libellés
  // identiques au web sont importés de `fr.shell` par les écrans (ADR-3002 § 4) ; cet espace ne
  // porte que les libellés propres au mobile.
  shell: {
    tabs: {
      today: 'Aujourd’hui',
      programme: 'Programme',
      revise: 'Réviser',
      agenda: 'Agenda',
      profile: 'Profil',
      /** Announced label of a tab: its label, its rank and the number of tabs (ET-5). */
      position: (label: string, index: number, total: number) =>
        `${label}, onglet ${String(index)} sur ${String(total)}`,
      barLabel: 'Navigation principale',
    },
    web: { continue: 'Continuer sur le web' },
    header: {
      loading: 'Chargement de l’en-tête…',
      errorTitle: 'Impossible de charger votre compte.',
      /** Announced text of the unread pastille (ET-5, CL-3). */
      badge: (count: number) =>
        count === 0
          ? 'Aucune notification non lue'
          : count === 1
            ? '1 notification non lue'
            : `${String(count)} notifications non lues`,
    },
    account: {
      title: 'Mon compte',
      subtitle: (formations: string) => `Apprenant · ${formations}`,
      settingsHint: 'Rappels, sons et modèles d’IA',
      pauseHint: 'Suspendre les rappels une semaine',
      pauseUnavailable: 'La mise en pause arrive avec SPEC-3401.',
      signOutTitle: 'Se déconnecter ?',
      signOutConfirm: 'Se déconnecter',
      cancel: 'Annuler',
      loading: 'Chargement du compte…',
      active: 'Actif',
    },
    states: {
      placeholderTitle: 'Écran en préparation',
      placeholderBody: 'Cet écran arrive avec une prochaine version de l’application.',
      noFormationTitle: 'Aucune formation active',
      noFormationBody:
        'Créez votre première formation sur le web : le tuteur prépare ensuite votre programme.',
      createFormation: 'Créer une formation sur le web',
      loading: 'Chargement…',
      unexpectedTitle: 'Une erreur inattendue est survenue',
      unexpectedBody: 'Relancez l’application pour reprendre votre travail.',
      relaunch: 'Relancer',
      onboardingTitle: 'Terminez votre configuration sur le web',
      onboardingBody:
        'Votre tuteur a besoin de votre rythme, de votre objectif et de vos apports avant la première séance. La configuration se poursuit sur le web, puis vous revenez ici.',
      onboardingContinue: 'Continuer sur le web',
      onboardingDone: 'J’ai terminé',
      onboardingChecking: 'Vérification de votre configuration…',
      onboardingError: 'Impossible de vérifier votre configuration.',
      onboardingDoneToast: 'Configuration terminée. Bienvenue dans Learny.',
    },
  },
  notifications: {
    /** Sub-title of the sheet, formatted like the mockup (« 3 non lues »). */
    unreadLabel: (count: number) =>
      count === 1 ? '1 non lue' : count === 0 ? 'Tout est lu' : `${String(count)} non lues`,
    empty: 'Aucune notification',
    emptyUnread: 'Aucune notification non lue',
    emptyBody: 'Les prochains rappels arriveront ici.',
    offlineReadOnly: 'Disponible une fois en ligne',
    unavailable: 'Ce contenu n’est plus disponible.',
    markedRead: 'Notification marquée comme lue.',
    markedAllRead: 'Toutes les notifications sont lues.',
    loadError: 'Impossible de charger les notifications.',
    sheetLabel: 'Centre de notifications',
    listLabel: 'Liste des notifications',
    time: (value: string) => `Reçue à ${value}`,
    unreadDot: 'Non lue',
  },
  // SPEC-3202 — onglet Programme : formation, modules, chapitres, calendrier et renvois au web.
  programme: {
    title: 'Programme',
    formationFallback: 'Formation',
    switcherLabel: 'Changer de formation',
    newFormation: 'Nouvelle formation',
    progressLabel: 'Progression de la formation',
    views: {
      label: 'Vue du programme',
      modules: 'Modules',
      calendar: 'Calendrier',
    },
    importProgramme: 'Importer votre programme',
    module: {
      status: {
        open: 'En cours',
        validated: 'Validé',
        locked: 'Verrouillé',
      },
      openMeta: (chapters: number, threshold: number) =>
        `${String(chapters)} chapitres · quiz à ${String(threshold)} %`,
      validatedMeta: (chapters: number, score: number | null) =>
        score === null
          ? `${String(chapters)} chapitres validés`
          : `${String(chapters)} chapitres terminés · ${String(score)} %`,
      lockedMeta: (chapters: number, previous: number) =>
        `${String(chapters)} chapitres · après le module ${String(previous)}`,
      unlock: (position: number) =>
        `Se débloque quand le quiz du module ${String(position)} est validé.`,
      toggle: (position: number, title: string) => `Module ${String(position)}, ${title}`,
      quiz: 'Quiz de validation',
      exam: 'Examen blanc',
      chapters: (count: number) => (count === 1 ? '1 chapitre' : `${String(count)} chapitres`),
    },
    chapter: {
      validated: 'Validé',
      minutes: (count: number) => `${String(count)} min`,
      current: 'En cours',
      upcoming: 'À venir',
      open: (title: string) => `Ouvrir le chapitre ${title}`,
    },
    resume: (position: number) => `Reprendre le chapitre ${String(position)}`,
    calendar: {
      title: 'Calendrier de la formation',
      sessionsLegend: 'Séance',
      todayLegend: 'Aujourd’hui',
      todayChip: 'Aujourd’hui',
      nextSession: 'Prochaine séance',
      openQuiz: 'Ouvrir le quiz',
      moduleLabel: (position: number, title: string) => `Module ${String(position)} · ${title}`,
      empty: 'Aucune séance planifiée',
    },
    switcher: {
      title: 'Changer de formation',
      current: 'Formation courante',
      active: 'Active',
      paused: 'En pause',
      resumeOnWeb: 'Reprendre sur le web',
      offline: 'Le changement de formation est indisponible hors ligne.',
      empty: 'Aucune autre formation',
    },
    web: {
      createTitle: 'Nouvelle formation',
      createBody:
        'La création d’une formation se fait sur le web : le tuteur vous guide en cinq questions, puis prépare votre programme.',
      importTitle: 'Importer votre programme',
      importBody:
        'Collez un texte ou déposez un fichier : le tuteur le structure en programme. Vous le relisez et le validez sur le web.',
      continue: 'Continuer sur le web',
    },
    locked: {
      title: (position: number) => `Module ${String(position)} verrouillé`,
      body: (position: number) =>
        `Se débloque quand le quiz du module ${String(position)} est validé.`,
      close: 'Compris',
    },
    banner: {
      pausedTitle: 'Formation en pause',
      pausedBody: 'Reprenez la formation sur le web pour relancer votre planning.',
      pausedAction: 'Reprendre sur le web',
      completedTitle: 'Formation terminée',
      completedBody: 'Tous les modules sont validés. Le bilan complet vous attend sur le web.',
      completedAction: 'Voir le bilan sur le web',
    },
    proposal: {
      title: 'Programme à valider sur le web',
      body: 'Votre tuteur a préparé votre programme. Relisez-le et validez-le sur le web pour commencer.',
      action: 'Continuer sur le web',
    },
    states: {
      loading: 'Chargement du programme',
      errorTitle: 'Impossible de charger le programme.',
      errorBody: 'Vérifiez votre connexion, puis réessayez.',
      noFormationTitle: 'Aucune formation active',
      noFormationBody:
        'Créez votre première formation sur le web : le tuteur prépare ensuite votre programme.',
      noFormationAction: 'Créer une formation sur le web',
      skeleton: 'Chargement du programme',
    },
    moduleScreen: {
      title: 'Module',
      back: 'Retour au programme',
      chapters: 'Chapitres',
      apports: 'Voir les apports sur le web',
      quiz: 'Ouvrir le quiz sur le web',
      unavailable: 'Module introuvable.',
      contributionsDone: 'Apports terminés',
      contributionsInProgress: 'Apports en cours',
    },
  },
} as const;

export type MobileMessages = typeof mobile;
