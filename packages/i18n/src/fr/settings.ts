export const settings = {
  eyebrow: 'Paramètres',
  tabsLabel: 'Rubriques des paramètres',
  tabs: {
    profil: 'Profil',
    notifications: 'Notifications',
    automatismes: 'Automatismes',
    modeles: 'Modèles d’IA',
  },
  coming: {
    notifications: 'La gestion des notifications arrive avec SPEC-708.',
    automatismes: 'Les automatismes arrivent avec SPEC-710.',
    modeles: 'Les modèles d’IA arrivent avec SPEC-709.',
  },
  automations: {
    principle:
      'Entre deux séances, le tuteur agit pour vous : il rattrape, rappelle et entraîne au bon moment.',
    principlePoints: [
      'Chaque action est expliquée et peut être annulée',
      'Les grands changements de planning attendent votre accord',
      'Les heures calmes sont toujours respectées',
    ],
    activeCount: (active: number, total: number) =>
      `${String(active)} automatismes actifs sur ${String(total)}`,
    count: (count: number) => `${String(count)} action${count > 1 ? 's' : ''} cette semaine`,
    pausedPrefix: 'En pause · ',
    loading: 'Chargement des automatismes…',
    errorTitle: 'Les automatismes n’ont pas pu être chargés.',
    saveError: 'Le réglage n’a pas pu être enregistré. L’état du serveur est conservé.',
    undoError: 'L’action n’a pas pu être annulée. Réessayez.',
    retry: 'Réessayer',
    saved: 'Réglages enregistrés.',
    groups: {
      decrochage: {
        title: 'Contre le décrochage',
        description: 'Garder le fil, même les semaines difficiles.',
      },
      memoire: {
        title: 'Mémorisation',
        description: 'Se rappeler au bon moment, sans surcharge.',
      },
      quiz: {
        title: 'Quiz et jeux',
        description: 'S’entraîner là où c’est utile.',
      },
    },
    lastAction: 'Dernière action',
    noLastAction: 'Aucune action pour le moment.',
    items: {
      reprise: {
        title: 'Reprise après décrochage',
        rule: 'Une séance manquée est replacée dans une marge. Après quelques jours sans activité, le tuteur propose une reprise de 5 minutes, puis d’alléger le programme ou de décaler la fin.',
        settings: {
          inactiveDays: {
            label: 'Proposer une reprise après',
            options: { '1': '1 jour', '2': '2 jours', '3': '3 jours' },
          },
          lightenDays: {
            label: 'Proposer d’alléger après',
            options: { '4': '4 jours', '5': '5 jours', '7': '7 jours' },
          },
          mode: {
            label: 'Replacer les séances manquées',
            options: { auto: 'Automatiquement', accord: 'Après mon accord' },
          },
        },
      },
      micro_seance: {
        title: 'Micro-séance de secours',
        rule: 'Si la séance du jour n’est pas faite le soir, une version courte est proposée (cartes de rappel et une question) pour garder le rythme et la série.',
        settings: {
          hour: {
            label: 'Proposée à',
            options: { '19': '19:00', '20': '20:00', '21': '21:00' },
          },
          durationMin: {
            label: 'Durée',
            options: { '3': '3 min', '5': '5 min', '10': '10 min' },
          },
        },
      },
      bilan: {
        title: 'Bilan de la semaine et replanification',
        rule: 'Une fois par semaine : progression, mémorisation, notions à risque et plan de la semaine suivante. Le tuteur demande si vos disponibilités changent.',
        settings: {
          weekday: {
            label: 'Jour',
            options: { '5': 'Vendredi', '6': 'Samedi', '7': 'Dimanche' },
          },
          hour: {
            label: 'Heure',
            options: { '18': '18:00', '19': '19:00', '20': '20:00' },
          },
          channel: {
            label: 'Canal',
            options: { app: 'Application', app_email: 'Application et e-mail' },
          },
        },
      },
      echauffement: {
        title: 'Échauffement de début de séance',
        rule: 'Chaque séance commence par quelques questions sur les notions de la veille et les prérequis du chapitre : on se rappelle avant de lire.',
        settings: {
          count: {
            label: 'Nombre de questions',
            options: { '2': '2', '3': '3', '5': '5' },
          },
          scope: {
            label: 'Porte sur',
            options: {
              yesterday_prerequisites: 'La veille et les prérequis',
              yesterday: 'La veille seulement',
            },
          },
        },
      },
      questions_cartes: {
        title: 'Vos questions deviennent des cartes',
        rule: 'Une question posée au tuteur devient une carte de rappel, révisée à intervalles espacés avec les autres.',
        settings: {
          mode: {
            label: 'Création',
            options: { confirm: 'Avec ma confirmation', auto: 'Automatique' },
          },
        },
      },
      plafond_quiz: {
        title: 'Quiz global plafonné et lissé',
        rule: 'Quand trop de notions sont dues le même jour, la révision est étalée sur les jours suivants, lacunes en tête, pour que la charge reste tenable.',
        settings: {
          maxMinutes: {
            label: 'Durée maximale par jour',
            options: { '10': '10 min', '15': '15 min', '20': '20 min', '30': '30 min' },
          },
          targetRetention: {
            label: 'Taux de mémorisation visé',
            options: { '0.85': '85 %', '0.9': '90 %', '0.95': '95 % (plus de révisions)' },
          },
        },
      },
      remediation: {
        title: 'Remédiation après un quiz raté',
        rule: 'Sous le seuil, une remédiation ciblée sur les lacunes est préparée et la tentative suivante est planifiée après un délai, pour éviter de répondre au hasard.',
        settings: {
          delayHours: {
            label: 'Délai avant la tentative suivante',
            options: { '0': 'Aucun', '12': '12 h', '24': '24 h', '48': '48 h' },
          },
          mode: {
            label: 'Remédiation',
            options: { advised: 'Conseillée', mandatory: 'Obligatoire' },
          },
        },
      },
      jeu_lacune: {
        title: 'Jeu choisi selon la lacune',
        rule: 'Confusion : un jeu d’association ou de classement oppose les deux notions. Oubli : cartes de rappel. Difficulté d’application : un exercice.',
        settings: {
          preference: {
            label: 'Préférence',
            options: {
              vary: 'Varier les jeux',
              cards: 'Plutôt des cartes de rappel',
              matching: 'Plutôt association et classement',
            },
          },
        },
      },
      sprint: {
        title: 'Sprint avant un jalon',
        rule: 'Avant un quiz de validation ou un examen blanc, des révisions courtes sont ajoutées sur les notions les plus faibles du module.',
        settings: {
          daysBefore: {
            label: 'Commencer',
            options: { '2': '2 jours avant', '3': '3 jours avant', '5': '5 jours avant' },
          },
          durationMin: {
            label: 'Durée d’un sprint',
            options: { '15': '15 min', '30': '30 min', '45': '45 min' },
          },
        },
      },
      pause: {
        title: 'Mode pause et retour',
        rule: 'Vacances, rush au travail : le planning est gelé sans casser la série. Au retour, un court diagnostic sur les notions à risque, puis une replanification.',
        settings: {
          pauseUntil: { label: 'En pause jusqu’au', options: {} },
          diagnosticOnReturn: { label: 'Diagnostic au retour', options: {} },
        },
      },
    },
    pauseUntil: 'En pause jusqu’au',
    diagnose: 'Diagnostic au retour',
    startPause: 'Mettre en pause',
    pauseScheduled: (date: string) => `Pause programmée jusqu’au ${date}.`,
    pauseActive: (date: string) => `En pause jusqu’au ${date}.`,
    pauseDiagnosticPlanned:
      'Au retour : diagnostic de 10 min sur les notions à risque, puis nouveau planning.',
    pauseWithoutDiagnostic: 'Au retour : nouveau planning.',
    resumeNow: 'Reprendre maintenant',
    pauseResumed: 'Pause terminée : le planning reprend.',
    pauseDiagnosticProposed: (minutes: number) =>
      `Pause terminée : un diagnostic de ${String(minutes)} minutes sur les notions à risque est proposé une seule fois avant la replanification.`,
    pauseDiagnosticDone: (answered: number, count: number) =>
      `Diagnostic terminé : ${String(answered)} réponse${answered === 1 ? '' : 's'} sur ${String(count)} notion${count === 1 ? '' : 's'}. Le planning est replanifié.`,
    guardrails: {
      title: 'Garde-fous',
      maxPerDay: 'Notifications par jour, au maximum',
      maxPerDayValue: (count: number) => `${String(count)} par jour`,
      bigChanges: 'Grands changements de planning',
      bigChangesHint: 'Alléger le programme, décaler la fin',
      alwaysConsent: 'Toujours sur accord',
      quietHours: 'Heures calmes',
      quietRange: (start: string, end: string) => `${start} – ${end}`,
      edit: 'Modifier',
    },
    journal: {
      title: 'Journal de la semaine',
      description: 'Ce que les automatismes ont fait, et pourquoi.',
      empty: 'Aucune action cette semaine.',
      undo: 'Annuler',
      statuses: {
        pending_consent: 'En attente',
        applied: 'Appliquée',
        declined: 'Refusée',
        undone: 'Annulée',
        expired: 'Expirée',
        consumed: 'Consommée',
      },
    },
  },
  aiModels: {
    principle:
      'Claude est utilisé par défaut. Remplacez-le, tâche par tâche, par le modèle de votre choix avec votre propre clé.',
    principlePoints: [
      'Vos clés sont chiffrées et ne reviennent jamais au navigateur',
      'Chaque modèle est testé avant d’être activé',
      'Révisions, lacunes et planning ne dépendent d’aucun modèle',
    ],
    guard: (cap: string) =>
      `Vos clés personnelles ne consomment pas le plafond de l’IA fournie (${cap} par jour).`,
    tasksTitle: 'Modèle par tâche',
    tasksSubtitle: 'Seuls les modèles qualifiés pour la tâche sont proposés.',
    reset: 'Revenir aux modèles par défaut',
    resetDone: 'Modèles fournis rétablis ; vos clés sont conservées.',
    defaultPill: 'Par défaut',
    customPill: 'Personnalisé',
    outsideEuPill: 'Hors UE',
    required: (capabilities: string) => `Exige : ${capabilities}`,
    capabilities: {
      tools: 'appel d’outils',
      structured: 'sortie structurée',
      web_search: 'recherche web',
      passage_refs: 'renvois aux apports',
      vision: 'vision',
    },
    taskLabels: {
      programme: 'Conception du programme',
      course: 'Rédaction du cours',
      gaps: 'Analyse des lacunes',
      tutor: 'Tuteur, questions, jeux et correction',
      light: 'Tâches légères (classement, découpage)',
    },
    taskNotes: {
      programme: 'Recherche web assurée par l’API de recherche de la plateforme',
      course: 'Citations remplacées par des renvois vérifiés aux apports',
    },
    unavailable: 'Ce modèle n’est plus qualifié pour cette tâche.',
    unavailableHint: 'Choisissez un autre modèle qualifié : aucune bascule payante n’est faite.',
    providersTitle: 'Mes fournisseurs',
    providedBadge: 'Par défaut',
    providedModels: 'Opus, Sonnet, Haiku · recherche web et citations intégrées',
    status: {
      qualified: 'Qualifié',
      unqualified: 'Non qualifié',
      pending: 'En cours',
    },
    yourKey: (mask: string) => `Votre clé · ${mask}`,
    noKey: 'Aucune clé : les modèles locaux n’en demandent pas.',
    retest: 'Tester à nouveau',
    retesting: 'Test en cours…',
    relance: 'Relancer le test',
    deleteKey: 'Supprimer la clé',
    deleting: 'Suppression…',
    failureBrick: (brick: string) =>
      `Échec du test : sortie non conforme pour la brique « ${brick} ». Le modèle reste désactivé.`,
    failureStep: (step: string) =>
      `Échec du test à l’étape « ${step} ». Le modèle reste désactivé.`,
    addProvider: 'Ajouter un fournisseur',
    formTitle: 'Ajouter un fournisseur',
    formProvider: 'Fournisseur',
    formModel: 'Nom du modèle',
    formModelPlaceholder: 'Tel qu’indiqué par le fournisseur',
    formUrl: 'Adresse du point d’accès',
    formUrlPlaceholder: 'https://… ou http://localhost:11434',
    formKey: 'Clé d’API',
    formKeyPlaceholder: 'Collez votre clé',
    testAndQualify: 'Tester et qualifier',
    saveProvider: 'Enregistrer le fournisseur',
    cancel: 'Annuler',
    resultTitle: 'Résultat de la qualification',
    qualifRunning: 'Qualification en cours : connexion, appel d’outils, sortie structurée…',
    qualifPassed: 'Modèle qualifié : il peut être affecté à une tâche.',
    qualifFailed: 'Modèle non qualifié : il n’est pas proposé dans les sélecteurs.',
    steps: {
      connection: 'Connexion',
      tools: 'Appel d’outils',
      structured: 'Sortie au format imposé',
      bricks: 'Une brique de chaque type',
    },
    stepStatus: { passed: 'réussi', failed: 'échec' },
    regionWarning: 'Traite les données hors de l’Union européenne',
    formIncomplete: 'Renseignez le fournisseur, le nom du modèle et la clé d’API.',
    loading: 'Chargement des modèles d’IA…',
    errorTitle: 'Impossible de charger les modèles d’IA.',
    saveError: 'Enregistrement impossible. Vérifiez votre réseau puis réessayez.',
    assignmentDone: 'Choix enregistré.',
    deleted: 'Clé supprimée ; ses affectations ont été retirées.',
    testError: 'La qualification n’a pas pu être lancée. Réessayez.',
    managed: {
      title: 'Abonnement à l’IA fournie',
      description:
        'Gratuit avec votre propre clé. L’IA fournie est incluse dans l’abonnement mensuel, avec un plafond quotidien.',
      loading: 'Chargement de l’abonnement…',
      errorTitle: 'Impossible de charger l’abonnement à l’IA fournie.',
      actionError: 'L’opération n’a pas pu être ouverte. Réessayez.',
      subscribe: 'Souscrire',
      manage: 'Gérer l’abonnement',
      badges: {
        managed: 'IA fournie active',
        personal: 'Votre clé',
        unavailable: 'IA indisponible',
      },
      reasons: {
        subscription_active:
          'L’IA fournie est active : les cinq tâches utilisent les modèles inclus.',
        personal_key:
          'Sans abonnement, vos clés qualifiées alimentent les tâches que vous avez choisies.',
        none: 'Aucune IA disponible pour vos tâches : ajoutez une clé qualifiée ou abonnez-vous. Les révisions, quiz déjà générés et l’agenda restent utilisables.',
      },
      unavailable:
        'IA indisponible : ajoutez une clé qualifiée ou souscrivez à l’IA fournie pour lancer une tâche IA.',
      capTitle: 'Consommation du jour',
      capUsage: (spent: string, cap: string) => `${spent} dépensés sur ${cap}`,
      capGaugeLabel: 'Consommation de l’IA fournie par rapport au plafond quotidien',
      capPercent: (percent: number) => `${String(percent)} % du plafond quotidien`,
      alert: (threshold: number) =>
        `Alerte : vous avez dépassé ${String(threshold)} % du plafond de l’IA fournie pour aujourd’hui.`,
      reached: (resetsAt: string) =>
        `Plafond atteint : les tâches basculent sur le modèle léger jusqu’au ${resetsAt}. La conception du programme reprendra le lendemain.`,
    },
  },
  notificationsTab: {
    channelsTitle: 'Canaux',
    channelsDescription:
      'Où vous recevez les rappels. Le centre de notifications (la cloche) les garde toujours.',
    channels: {
      app: {
        label: 'Dans l’application',
        description: 'La cloche, en haut de chaque écran',
      },
      email: { label: 'E-mail' },
      browser: { label: 'Navigateur', description: 'Même application fermée' },
    },
    typesTitle: 'Ce qui vous est notifié',
    typesDescription:
      'Les rappels de mémorisation sont recommandés : ils font le gros du travail contre l’oubli.',
    typeCount: (active: number) => `${String(active)} sur 6 activés`,
    recommended: 'Recommandé',
    types: {
      revision: {
        label: 'Révisions et quiz global',
        description: 'Les notions dues du jour, à l’heure prévue',
      },
      validation: {
        label: 'Quiz de validation à venir',
        description: 'Un rappel 40 min avant chaque quiz',
      },
      course: {
        label: 'Cours prêt à relire',
        description: 'Quand le tuteur a fini de rédiger un chapitre',
      },
      gap: {
        label: 'Nouvelle lacune repérée',
        description: 'Avec la notion concernée et ce que le tuteur propose',
      },
      planning: {
        label: 'Planning réajusté',
        description: 'Quand une marge est utilisée ou que le tuteur propose des options',
      },
      relaunch: {
        label: 'Relance après une pause',
        description: 'Progressive et discrète, au bout de 2 jours sans activité',
      },
    },
    whenTitle: 'Quand',
    whenDescription: 'Aucune notification pendant les heures calmes : elles attendent le matin.',
    digestLabel: 'Programme du jour envoyé à',
    quietStartLabel: 'Heures calmes, de',
    quietEndLabel: 'à',
    weekendLabel: 'Rien le week-end, sauf les révisions dues',
    quietEffective: (start: string, end: string, crossesMidnight: boolean) =>
      `Plage effective : ${start}–${end}${crossesMidnight ? ' (le lendemain)' : ''}.`,
    quietEmpty: 'Plage effective : aucune heure calme (début = fin).',
    browserDenied:
      'Notifications navigateur indisponibles : permission refusée. Les autres canaux restent configurables.',
    browserUnavailable: 'Notifications navigateur indisponibles sur ce navigateur.',
    loading: 'Chargement des réglages de notifications…',
    errorTitle: 'Impossible de charger les réglages de notifications.',
    saveError: 'Enregistrement impossible. Vérifiez votre réseau puis réessayez.',
    retry: 'Réessayer',
  },
  loading: 'Chargement des paramètres…',
  errorTitle: 'Impossible de charger les paramètres.',
  identity: {
    title: 'Identité',
    created: (date: string, formations: string) => `Compte créé le ${date} · ${formations}`,
    firstName: 'Prénom',
    lastName: 'Nom',
    email: 'Adresse e-mail',
    emailHint: 'Les rappels par e-mail partent à cette adresse.',
    language: 'Langue des cours',
    toneLabel: 'Le tuteur vous parle en',
    toneVous: 'Vouvoyant',
    toneTu: 'Tutoyant',
    timezone: 'Fuseau horaire',
  },
  rhythm: {
    title: 'Rythme d’apprentissage',
    subtitle:
      'Le tuteur s’en sert pour placer les activités dans l’agenda. Valeur par défaut des nouvelles formations.',
  },
  privacy: {
    title: 'Données et confidentialité',
    description:
      'Vos apports, cours et résultats restent à vous : exportables à tout moment, supprimés avec le compte.',
    exportTrigger: 'Exporter mes données',
    exportTitle: 'Exporter vos données ?',
    exportDescription:
      'Une archive ZIP contenant vos cours, vos apports et vos résultats sera prête dans moins de 15 minutes. Le lien de téléchargement restera valable 7 jours.',
    exportConfirm: 'Exporter',
    exportPending: 'Demande d’export…',
    exportQueued: 'Export en file d’attente.',
    exportRunning: 'Export en cours.',
    exportReady: 'Export prêt.',
    exportFailed: 'L’export a échoué. Vous pouvez redemander un export.',
    exportNone: 'Aucun export demandé pour l’instant.',
    download: 'Télécharger',
    expires: (label: string) => `Valable jusqu’au ${label}.`,
    size: (label: string) => `Taille : ${label}.`,
    deleteTrigger: 'Supprimer mon compte',
    deleteTitle: 'Supprimer votre compte ?',
    deleteDescription: (label: string) =>
      `Toutes vos données personnelles et vos fichiers seront effacés définitivement le ${label}. Vous pourrez annuler cette demande jusque-là.`,
    deleteConfirm: 'Supprimer mon compte',
    deletePending: 'Demande en cours…',
    cancelTrigger: 'Annuler la suppression',
    cancelPending: 'Annulation…',
    deleteNone: 'Aucune suppression programmée.',
    deleteScheduled: (label: string) =>
      `Suppression programmée le ${label}. Vous pouvez encore annuler.`,
  },
  save: 'Enregistrer',
  saving: 'Enregistrement…',
  saved: 'Modifications enregistrées',
  saveError: 'Enregistrement impossible. Vérifiez votre réseau et réessayez.',
  conflict: 'Vos paramètres ont été modifiés dans un autre onglet. Rechargez-les puis réessayez.',
} as const;

export const fr = { settings } as const;
