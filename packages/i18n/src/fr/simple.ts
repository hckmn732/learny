// Libellés du mode simple « Dépose ton cours » (SPEC-4002 EF-1 à EF-7, ET-3, ET-4 ; ADR-4003).
// Textes copiés à l'identique de `design/mode-simple/index.html`, vue Web, étapes 1 à 6 et état
// « Sans clé d'IA » : aucune reformulation, les maquettes font foi (ADR-0034).

export const simple = {
  choice: {
    kicker: 'Commencer une formation',
    dropCard: {
      badge: 'Nouveau · le plus rapide',
      title: 'Dépose ton cours',
      body: 'PDF, Word, photos de pages ou lien vidéo. On en fait un programme complet : cours, exercices, quiz et révisions.',
      hint: 'Prêt en quelques minutes',
      action: 'Déposer mes fichiers',
    },
    tutorCard: {
      badge: 'Sur mesure',
      title: 'Construire avec le tuteur',
      body: 'Tu pars d’un objectif. Le tuteur te pose quelques questions et propose un programme fait pour toi.',
      hint: '5 questions · 5 min',
      action: 'Commencer le cadrage',
    },
    dialogTitle: 'Commencer une formation',
    dialogDescription:
      'Deux façons de commencer : dépose ton cours, ou construis le programme avec le tuteur.',
    dialogClose: 'Fermer',
  },
  roles: {
    course: 'Cours',
    exercises: 'Exercices',
    exam_papers: 'Annales',
    other: 'Autre support',
  },
  roleNote:
    'Le cours donne la structure ; exercices et annales alimentent les exercices et les quiz.',
  depot: {
    back: 'Accueil',
    title: 'Dépose ton cours',
    intro:
      'Un ou plusieurs fichiers. On en fait une formation complète, et tu valides avant de commencer.',
    dropzone: {
      label: 'Glisse tes fichiers ici',
      browse: 'ou parcours ton ordinateur · PDF, Word, texte, images · jusqu’à 1 000 pages',
      ariaLabel: 'Déposer des fichiers de cours',
      keyboard: 'Appuie sur Entrée ou sur Espace pour parcourir tes fichiers.',
      live: 'Zone de dépôt',
    },
    file: {
      meta: (pages: number | null, size: string) =>
        pages === null ? size : `${String(pages)} pages · ${size}`,
      roleLabel: (role: string) => `Rôle : ${role}`,
      remove: 'Retirer',
      progress: (percent: number) => `Téléversement ${String(percent)} %`,
      progressLabel: (name: string) => `Progression de ${name}`,
      statuses: {
        queued: 'En attente',
        uploading: 'Téléversement…',
        processing: 'Traitement…',
        ready: 'Lu',
        failed: 'Échec',
      },
      retry: 'Réessayer',
    },
    link: {
      label: 'Ou colle un lien : vidéo YouTube, page web…',
      action: 'Ajouter le lien',
      invalid: 'Ce lien n’est pas valide. Colle une adresse https complète.',
      added: (title: string) => `${title} ajouté.`,
    },
    motivation: {
      label: 'Pourquoi tu l’apprends ?',
      optional: 'facultatif',
      placeholder: 'Examen le 15 juin, reconversion, culture…',
    },
    note: 'Le contenu vient de tes documents, avec les pages citées. Tout ajout du tuteur est signalé.',
    create: 'Créer ma formation',
    createPending: 'Création…',
    createHint: 'Analyse en moins d’une minute · rien ne démarre sans ton accord',
    announce: {
      added: (name: string) => `${name} ajouté.`,
      removed: (name: string) => `${name} retiré.`,
      role: (name: string, role: string) => `${name} : rôle ${role}.`,
      empty: 'Aucun fichier ni lien déposé.',
      count: (count: number) =>
        `${String(count)} document${count === 1 ? '' : 's'} déposé${count === 1 ? '' : 's'}.`,
    },
  },
  key: {
    title: 'Ajoute ta clé d’IA pour continuer',
    body: 'Learny fonctionne avec ta propre clé (OpenAI, Anthropic, Mistral…). Tes fichiers restent déposés ici.',
    action: 'Ajouter ma clé',
    back: 'Revenir au dépôt',
  },
  analysis: {
    title: 'On lit tes documents',
    hint: 'Tu peux quitter cette page : on te prévient dès que ton programme est prêt.',
    stepLabels: {
      read: 'Lecture des documents',
      structure: 'Structure détectée',
      practice: 'Exercices et annales repérés',
      programme: 'Construction du programme',
    },
    stepStates: { todo: 'À venir', running: 'En cours', done: 'Terminée' },
    progressLabel: 'Progression de l’analyse',
    chapters: 'Chapitres trouvés dans le manuel',
    reading: 'Lecture en cours…',
    failedTitle: 'L’analyse n’a pas abouti',
    retry: 'Réessayer',
    announce: {
      step: (label: string, state: string) => `${label} : ${state}.`,
      chapters: (count: number, title: string) =>
        `${String(count)} chapitres trouvés, dont « ${title} ».`,
      done: 'Analyse terminée : ton programme est prêt.',
      failed: 'L’analyse a échoué. Tu peux réessayer.',
    },
  },
  overview: {
    badge: 'Programme prêt',
    title: 'Aperçu du programme',
    sourcePrefix: 'D’après',
    kpis: {
      modules: 'modules',
      hours: 'd’étude',
      perDay: 'par jour, lun.–ven.',
      end: 'fin prévue',
    },
    modulesTitle: 'Les modules',
    modulesOrder: 'Suit l’ordre du manuel',
    moduleMeta: (chapters: number, hours: string) =>
      `${String(chapters)} chapitre${chapters === 1 ? '' : 's'} · ${hours} · exercices et quiz`,
    pages: (from: number, to: number) => `p. ${String(from)}–${String(to)}`,
    moreModules: (count: number, last: string) =>
      `+ ${String(count)} autres modules, jusqu’à « ${last} »`,
    deadline: {
      title: 'Tu as une échéance ?',
      body: 'Un examen, une certification, une date à tenir.',
      no: 'Non, à mon rythme',
      yes: 'Oui, le…',
      dateLabel: 'Date de l’échéance',
      note: 'Objectif « examen » : le planning finit 2 semaines avant, avec un examen blanc.',
      invalid: 'Choisis une date à venir.',
    },
    start: 'C’est parti',
    startPending: 'Validation…',
    adjust: 'Ajuster avec le tuteur',
    generationNote:
      'Les premiers modules sont générés en priorité ; les suivants le seront avant que tu y arrives.',
    announce: {
      deadline: (end: string, perDay: string) =>
        `Échéance enregistrée : fin prévue le ${end}, ${perDay} par jour.`,
      validated: 'Programme validé. Le diagnostic est prêt.',
    },
  },
  diagnostic: {
    badge: 'Diagnostic · 10 min',
    title: 'Sautons ce que tu sais déjà',
    intro:
      'Une ou deux questions par module. Les modules réussis seront validés et passeront en révision.',
    skip: 'Passer le diagnostic',
    progress: (position: number, total: number) =>
      `Question ${String(position)} sur ${String(total)}`,
    noCorrection: 'Pas de correction avant la fin',
    moduleLine: (label: string) => `Module · ${label}`,
    validate: 'Valider',
    dontKnow: 'Je ne sais pas',
    choose: 'Choisis une réponse',
    answering: 'Enregistrement…',
    empty: 'Aucune question dans ce diagnostic.',
    errors: {
      DIAGNOSTIC_ALREADY_DONE: 'Ce diagnostic a déjà été passé.',
      AI_NOT_CONFIGURED: 'Ajoute ta clé d’IA pour générer le diagnostic.',
    },
  },
  result: {
    score: (correct: number, total: number) =>
      `Diagnostic terminé · ${String(correct)} bonnes réponses sur ${String(total)}`,
    skipped: 'Diagnostic passé',
    acquired: (count: number) => `${String(count)} module${count === 1 ? '' : 's'} déjà acquis`,
    none: 'Aucun module acquis : on commence au début',
    remaining: (modules: number, hours: string, day: string) =>
      `Il reste ${String(modules)} modules, ${hours}, fin prévue le ${day}.`,
    ready: 'Ton premier chapitre est prêt',
    readyMeta: (module: number, chapter: number, title: string) =>
      `Module ${String(module)} · Chapitre ${String(chapter)} : ${title}`,
    course: (minutes: number) => `Cours · ${String(minutes)} min`,
    exercises: (count: number) => `${String(count)} exercice${count === 1 ? '' : 's'}`,
    pages: (from: number, to: number) => `p. ${String(from)}–${String(to)}`,
    start: (minutes: number) => `Commencer · ${String(minutes)} min`,
    programme: 'Voir le programme',
    generation: 'Préparation du programme',
    generationStates: {
      acquired: 'Acquis au diagnostic · en révision',
      ready: 'Prêt',
      generating: 'En préparation…',
      queued: 'Prêts avant que tu y arrives',
    },
    generationModule: (position: number, title: string) => `Module ${String(position)} · ${title}`,
    citationNote:
      'Chaque cours cite les pages de ton manuel ; un complément du tuteur est marqué « Hors document ».',
    account: (name: string) => `« ${name} »`,
  },
  errors: {
    generic: 'Une erreur est survenue. Réessayez dans un instant.',
    AI_NOT_CONFIGURED: 'Ajoute ta clé d’IA pour continuer.',
    SIMPLE_NO_COURSE_SOURCE:
      'Dépose au moins un document de rôle « Cours » : il donne la structure du programme.',
    SIMPLE_TOO_MANY_SOURCES: 'Dix documents au plus par formation.',
    SIMPLE_ANALYSIS_LOCKED: 'L’analyse a commencé : les rôles ne sont plus modifiables.',
    SIMPLE_NOT_SIMPLE: 'Cette formation n’a pas été créée en mode simple.',
    FORMATION_LIMIT_REACHED:
      'Trois formations actives au plus. Mets-en une en pause pour continuer.',
    UPLOAD_TOO_LARGE: 'Ce fichier dépasse la taille autorisée.',
    UNSUPPORTED_TYPE: 'Ce format n’est pas pris en charge.',
    TEXT_EMPTY: 'Le document ne contient pas de texte exploitable.',
    QUOTA_EXCEEDED: 'Ton espace de stockage est plein.',
    URL_INVALID: 'Ce lien n’est pas valide.',
    YOUTUBE_INVALID_URL: 'Ce lien YouTube n’est pas valide.',
    PAYLOAD_TOO_LARGE: 'Le fichier est trop volumineux.',
    NOT_FOUND: 'Cette formation est introuvable.',
    CONFLICT: 'La formation a changé entre-temps. Recharge la page.',
    NETWORK_ERROR: 'Le serveur est injoignable. Vérifie ta connexion.',
  },
} as const;

export const fr = { simple } as const;
