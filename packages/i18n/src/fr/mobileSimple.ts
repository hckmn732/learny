// Libellés propres au mobile du mode simple (SPEC-4003 ET-5, ADR-3005 § 3).
//
// Les libellés identiques au web viendront de l'espace `simple` de SPEC-4002 ; tant que cet espace
// n'est pas fusionné, les textes de la maquette sont repris ici, à l'identique, et signalés pour
// réconciliation au rapport de la spécification. Les textes réellement propres au mobile
// (« Photos de pages », « Tu peux fermer l'app… ») restent dans cet espace `mobile`.
export const mobileSimple = {
  section: 'Nouvelle formation',
  cards: {
    dropBadge: 'Rapide',
    dropTitle: 'Dépose ton cours',
    dropBody:
      'PDF, Word, photos de pages ou lien vidéo. On en fait un programme complet : cours, exercices, quiz et révisions.',
    dropReady: 'Prêt en quelques minutes',
    dropAction: 'Déposer mes fichiers',
    tutorBadge: 'Sur mesure',
    tutorTitle: 'Construire avec le tuteur',
    tutorBody:
      'Tu pars d’un objectif. Le tuteur te pose quelques questions et propose un programme fait pour toi.',
    tutorMeta: '5 questions · 5 min',
    tutorAction: 'Commencer le cadrage',
  },
  deposit: {
    title: 'Dépose ton cours',
    lede: 'Un ou plusieurs fichiers. Tu valides le programme avant de commencer.',
    files: 'Fichiers',
    photos: 'Photos de pages',
    link: 'Lien',
    linkPlaceholder: 'Ou colle un lien : vidéo YouTube, page web…',
    linkAdd: 'Ajouter le lien',
    linkInvalid: 'Ce lien n’est pas valide : une adresse HTTPS est attendue.',
    linkDuplicate: 'Ce lien est déjà dans la liste.',
    motivationLabel: 'Pourquoi tu l’apprends ?',
    motivationOptional: '· facultatif',
    motivationPlaceholder: 'Examen le 15 juin, reconversion…',
    tip: 'Astuce : depuis une autre app, « Partager » puis « Learny » ajoute le fichier ici.',
    create: 'Créer ma formation',
    creating: 'Création…',
    hint: 'Analyse en moins d’une minute · rien ne démarre sans ton accord',
    uploadHint: 'Les fichiers confirmés restent acquis : seuls les autres sont renvoyés.',
    retry: 'Réessayer',
    remove: 'Retirer',
    rolePrefix: 'Rôle : ',
    roleTitle: 'Rôle du document',
    roleBody:
      'Le cours donne la structure ; exercices et annales alimentent les exercices et les quiz.',
    roles: {
      course: 'Cours',
      exercises: 'Exercices',
      exam_papers: 'Annales',
      other: 'Autre support',
    },
    statuses: {
      pending: 'En attente',
      uploading: 'Envoi…',
      uploaded: 'Envoyé',
      failed: 'Échec',
      ready: 'Prêt',
      processing: 'Traitement…',
      queued: 'En attente de lecture',
    },
    tooMany: 'Dix documents au plus : les suivants n’ont pas été ajoutés.',
    pickFailed: 'Le sélecteur n’a pas pu s’ouvrir. Réessaie depuis l’appareil.',
    permissionTitle: 'Accès refusé',
    permissionBody:
      'Autorise l’accès aux photos ou à l’appareil photo dans les réglages du système. Les autres boutons restent utilisables.',
    openSettings: 'Ouvrir les réglages',
    uploadFailed:
      'L’envoi de ce fichier a échoué. Réessaie : les fichiers confirmés ne sont pas renvoyés.',
    noCourse: 'Ajoute au moins un document de rôle « Cours » pour créer la formation.',
    sharedAdded: 'Fichier partagé ajouté au dépôt.',
    sharedFailed: 'Le fichier partagé n’a pas pu être lu.',
    draftRestored: 'Tes fichiers ont été retrouvés.',
  },
  key: {
    title: 'Ajoute ta clé d’IA pour continuer',
    body: 'Learny fonctionne avec ta propre clé (OpenAI, Anthropic, Mistral…). Tes fichiers restent déposés ici.',
    action: 'Ajouter ma clé',
  },
  analysis: {
    title: 'On lit tes documents',
    body: 'Tu peux fermer l’app : une notification te prévient quand c’est prêt.',
    steps: {
      read: 'Lecture des documents',
      structure: 'Structure détectée',
      practice: 'Exercices et annales repérés',
      programme: 'Construction du programme',
    },
    chapters: 'Chapitres trouvés',
    reading: 'Lecture en cours…',
    failedTitle: 'L’analyse n’a pas abouti',
    retry: 'Réessayer l’analyse',
    notification: 'Ton programme est prêt',
    notificationBody: 'Ouvre l’aperçu pour valider ton programme.',
  },
  preview: {
    ready: 'Programme prêt',
    from: 'D’après',
    modules: 'Les modules',
    modulesHint: 'Suit l’ordre du manuel',
    others: (count: number) =>
      `+ ${String(count)} autre${count === 1 ? '' : 's'} module${count === 1 ? '' : 's'}`,
    deadlineTitle: 'Tu as une échéance ?',
    deadlineBody: 'Un examen, une certification, une date à tenir.',
    deadlineNo: 'Non, à mon rythme',
    deadlineYes: 'Oui, le…',
    deadlinePick: 'Choisir une date',
    deadlineGoal: 'Objectif « examen » : le planning finit 2 semaines avant, avec un examen blanc.',
    start: 'C’est parti',
    adjust: 'Ajuster avec le tuteur',
    generationHint:
      'Les premiers modules sont générés en priorité ; les suivants le seront avant que tu y arrives.',
    kpis: {
      modules: 'modules',
      hours: 'd’étude',
      perDay: 'par jour, lun.–ven.',
      end: 'fin prévue',
    },
    noProposal: 'Le programme n’est pas encore prêt.',
    validateFailed: 'Le programme n’a pas pu être validé.',
    limitReached:
      'Trois formations actives au plus. Termine ou archive une formation pour continuer.',
  },
  diagnostic: {
    badge: 'Diagnostic · 10 min',
    skip: 'Passer',
    title: 'Sautons ce que tu sais déjà',
    lede: 'Une ou deux questions par module. Les modules réussis seront validés et passeront en révision.',
    progress: (position: number, total: number) =>
      `Question ${String(position)} sur ${String(total)}`,
    noCorrection: 'Pas de correction avant la fin',
    validate: 'Valider',
    dontKnow: 'Je ne sais pas',
    close: 'Fermer le diagnostic',
    closeTitle: 'Quitter le diagnostic ?',
    closeBody:
      'Tu peux le passer : les modules ne seront pas validés et le programme reste inchangé.',
    closeConfirm: 'Passer le diagnostic',
    closeCancel: 'Continuer',
    loading: 'Préparation du diagnostic…',
    failed: 'Le diagnostic n’a pas pu être chargé.',
    submitted: 'Diagnostic terminé',
    saveFailed: 'La réponse n’a pas pu être enregistrée.',
    retry: 'Réessayer',
  },
  result: {
    score: (correct: number, total: number) =>
      `Diagnostic terminé · ${String(correct)} bonnes réponses sur ${String(total)}`,
    skipped: 'Diagnostic passé',
    acquired: (count: number) =>
      count === 0
        ? 'Aucun module acquis : on commence au début'
        : `${String(count)} module${count === 1 ? '' : 's'} déjà acquis`,
    body: (modules: number, date: string) =>
      `Ils passent en révision. Il reste ${String(modules)} module${modules === 1 ? '' : 's'}, fin prévue le ${date}.`,
    bodySkipped: (modules: number, date: string) =>
      `Le programme reste complet : ${String(modules)} module${modules === 1 ? '' : 's'}, fin prévue le ${date}.`,
    readyEyebrow: 'Ton premier chapitre est prêt',
    startChapter: (minutes: number) => `Commencer · ${String(minutes)} min`,
    seeProgramme: 'Voir le programme',
    chapter: (position: number, title: string) =>
      `Module ${String(position)} · Chapitre ${String(position)} : ${title}`,
    prep: 'Préparation du programme',
    states: {
      acquired: 'Acquis au diagnostic · en révision',
      ready: 'Prêt',
      generating: 'En préparation…',
      queued: 'Prêts avant que tu y arrives',
    },
    footnote:
      'Chaque cours cite les pages de ton manuel ; un complément du tuteur est marqué « Hors document ».',
    loading: 'Chargement du résultat…',
    failed: 'Le résultat n’a pas pu être affiché.',
    noneReady: 'Le premier chapitre se prépare. Ouvre le programme pour suivre sa génération.',
    modulesAvailable: 'Modules disponibles',
    noAcquired: 'Aucun module validé par le diagnostic.',
  },
  share: {
    title: 'Partager vers Learny',
    added: 'Fichier partagé ajouté.',
    unsupported: 'Ce fichier n’est pas pris en charge : PDF, DOCX ou image attendu.',
    pendingSignIn: 'Connecte-toi : ton fichier est conservé et sera ajouté au dépôt.',
  },
} as const;
