// Zone A — Programme : apports, import du programme, bilan final, formations à plusieurs.
// Propriétaire : agent A. Registre : vouvoiement (espace « apports / programme » du web).
// Les clés s'ajoutent au fil des écrans ; ne rien mettre hors de cette zone.
export const mrProgramme = {
  apports: {
    title: 'Ajouter des apports',
    back: 'Retour au programme',
    eyebrow: (position: number, moduleTitle: string) =>
      `Module ${String(position)} · ${moduleTitle}`,
    intro:
      'Le tuteur s’appuie sur vos supports pour ce module. Ajoutez-les ici : il les cite ensuite dans le cours.',
    chapterLabel: (position: number) => `Chapitre ${String(position)}`,
    chapterPickerLabel: 'Chapitre affiché',
    tilesLabel: 'Ajouter un apport',
    files: 'Fichiers',
    photos: 'Photos',
    link: 'Lien',
    photosTitle: 'Ajouter des photos',
    photosCamera: 'Prendre une photo',
    photosLibrary: 'Choisir dans la galerie',
    photoPermission:
      'L’accès aux photos est refusé. Autorisez-le dans les réglages du téléphone, puis réessayez.',
    linkTitle: 'Ajouter un lien',
    linkAddress: 'Adresse de la page ou de la vidéo',
    linkAddressPlaceholder: 'https://…',
    linkName: 'Titre (facultatif)',
    linkNamePlaceholder: 'Ex. : plan de comptes',
    linkSubmit: 'Ajouter le lien',
    linkInvalid: 'Saisissez une adresse HTTPS complète.',
    addedTitle: (count: number) => `Déjà ajoutés · ${String(count)}`,
    addedEmptyTitle: 'Aucun apport pour l’instant',
    addedEmptyBody:
      'Déposez un fichier, une photo ou un lien : le tuteur s’en servira pour ce module.',
    uploadInProgress: 'Envoi en cours…',
    uploadFailed: 'Le fichier n’a pas pu être envoyé. Réessayez.',
    fileAdded: 'Apport ajouté.',
    linkAdded: 'Lien ajouté.',
    retryFailed: 'Le traitement n’a pas pu être relancé.',
    done: 'J’ai terminé mes apports',
    reopen: 'Rouvrir ce chapitre',
    completed: 'Apports terminés. Le tuteur peut rédiger le cours.',
    reopened: 'Chapitre rouvert.',
    completeFailed: 'L’état du chapitre n’a pas pu être enregistré.',
    importTitle: 'Vous avez déjà un programme ?',
    importBody: 'Importez un plan de cours : le tuteur l’adapte.',
    importAction: 'Importer',
    status: {
      queued: 'En file',
      processing: 'Lecture en cours…',
      ready: 'Analysé',
      failed: 'Échec',
    },
    loading: 'Chargement des apports…',
    errorTitle: 'Impossible de charger les apports.',
    errorBody: 'Vérifiez votre connexion, puis réessayez.',
    retry: 'Réessayer',
  },
  import: {
    title: 'Importer un programme',
    hint:
      'Déposez un PDF, un Word, un TXT ou un Markdown (700 ko au plus), ou collez votre programme : le tuteur en extrait modules, chapitres et notions.',
    pick: 'Choisir un fichier',
    pasted: 'Ou collez votre programme',
    placeholder: 'Module 1 : …\nChapitre 1 : …\nNotions : …',
    submit: 'Importer',
    submitting: 'Import en cours…',
    empty: 'Ajoutez un fichier ou collez un programme avant d’importer.',
    tooLarge: 'Le fichier dépasse 700 ko.',
    success: 'Programme importé. Le tuteur a préparé une proposition à valider.',
    error: 'L’import n’a pas pu aboutir. Réessayez.',
    fileLimit: 'Seuls les PDF, Word, TXT et Markdown sont acceptés.',
    activeTitle: 'Votre programme est déjà actif',
    activeBody:
      'L’import sert avant la validation du programme. Votre programme en cours reste inchangé.',
    close: 'Fermer',
    retry: 'Réessayer',
    cancel: 'Annuler',
  },
  bilan: {
    title: 'Bilan de la formation',
    eyebrow: 'Formation terminée',
    mastery: (percent: number) => `${String(percent)} %`,
    masteryLabel: 'de maîtrise',
    weeks: (weeks: number) => `${String(weeks)} semaine${weeks === 1 ? '' : 's'}`,
    stats: {
      notions: 'notions',
      hours: 'de travail effectif',
      fragile: 'notions fragiles',
    },
    strengthsTitle: 'Points forts',
    strengthsEmpty: 'Aucun module ne dépasse encore le seuil de maîtrise.',
    strengthsLine: (count: number, title: string) =>
      count === 1 ? `1 notion solide · ${title}` : `${String(count)} notions solides · ${title}`,
    watchTitle: 'À entretenir',
    watchEmpty: 'Aucune notion fragile : tout est solide.',
    maintenanceTitle: 'Entretien de mémoire',
    maintenanceHint:
      'Votre choix règle le quiz global et les rappels de cette formation. Il reste modifiable ici.',
    due: (count: number) =>
      count === 0
        ? 'Aucune notion due aujourd’hui.'
        : count === 1
          ? '1 notion due aujourd’hui.'
          : `${String(count)} notions dues aujourd’hui.`,
    mapAction: 'Ouvrir la carte des notions',
    share: 'Partager mon bilan',
    shareTitle: 'Mon bilan Learny',
    shareMessage: (formationTitle: string, percent: number | null) =>
      percent === null
        ? `J’ai terminé la formation « ${formationTitle} » sur Learny.`
        : `J’ai terminé la formation « ${formationTitle} » sur Learny, avec ${String(percent)} % de maîtrise.`,
    attestation: 'Télécharger mon attestation',
    shareError: 'Le partage n’a pas abouti. Réessayez.',
    attestationUnavailable: 'L’attestation n’est pas encore disponible sur mobile.',
    loading: 'Chargement du bilan…',
    errorTitle: 'Impossible de charger le bilan final.',
    errorBody: 'Vérifiez votre connexion, puis réessayez.',
    retry: 'Réessayer',
    notFound: 'Ce bilan est introuvable.',
  },
  groupe: {
    title: 'Formations à plusieurs',
    heading: 'À plusieurs',
    intro: 'Même programme et même agenda. Vos apports et vos résultats restent privés.',
    membersTitle: 'Membres',
    membersCount: (used: number, max: number) => `${String(used)} / ${String(max)} membres`,
    memberFallback: 'Membre',
    you: 'Vous',
    owner: 'Propriétaire',
    notStarted: 'Pas encore commencé',
    memberMeta: (modulePosition: number, streakDays: number) =>
      modulePosition === 0
        ? 'Pas encore commencé'
        : `Module ${String(modulePosition)} · série de ${String(streakDays)} j`,
    inviteLabel: (places: number) =>
      places <= 0
        ? 'Inviter · groupe complet'
        : `Inviter · ${String(places)} place${places === 1 ? '' : 's'} restante${places === 1 ? '' : 's'}`,
    shareLink: 'Partager le lien',
    shareTitle: 'Invitation Learny',
    shareError: 'Le partage n’a pas abouti. Réessayez.',
    shareMessage: (formationTitle: string, code: string, link: string) =>
      `Rejoignez « ${formationTitle} » sur Learny avec le code ${code} : ${link}`,
    rotate: 'Régénérer le code',
    rotateDone: 'Nouveau code prêt : l’ancien ne fonctionne plus.',
    rotateError: 'Le code n’a pas pu être régénéré. Réessayez.',
    joinAction: 'J’ai reçu un code d’invitation',
    joinTitle: 'Rejoindre une formation',
    joinLabel: 'Code d’invitation',
    joinPlaceholder: 'LRN-XXXX',
    joinSubmit: 'Rejoindre',
    joining: 'Adhésion…',
    joinInvalid: 'Un code au format LRN-XXXX est attendu.',
    joined: (formationTitle: string) => `Vous avez rejoint « ${formationTitle} ».`,
    create: 'Créer un groupe',
    creating: 'Création du groupe…',
    createError: 'Le groupe n’a pas pu être créé. Réessayez.',
    noneTitle: 'Formation individuelle',
    loading: 'Chargement du groupe…',
    errorTitle: 'Le groupe n’a pas pu être chargé.',
    errorBody: 'Vérifiez votre connexion, puis réessayez.',
    retry: 'Réessayer',
    back: 'Retour au programme',
  },
} as const;