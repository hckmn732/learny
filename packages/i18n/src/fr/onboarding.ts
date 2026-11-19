export const onboarding = {
  common: {
    back: 'Retour',
    continue: 'Continuer',
    saveError: 'Enregistrement impossible. Vérifiez votre réseau et réessayez.',
  },
  profil: {
    title: 'Faisons connaissance',
    subtitle: 'Le tuteur s’adressera à vous comme vous le souhaitez.',
    firstName: 'Prénom',
    toneLabel: 'Le tuteur vous parle en',
    toneVous: 'Vouvoyant',
    toneTu: 'Tutoyant',
    previewLabel: 'Aperçu :',
    previewVous: (name: string) =>
      `Bonjour ${name}, voici vos 3 activités du jour. On commence par un échauffement de 2 minutes ?`,
    previewTu: (name: string) =>
      `Bonjour ${name}, voici tes 3 activités du jour. On commence par un échauffement de 2 minutes ?`,
    fallbackName: 'Alex',
    language: 'Langue des cours',
    languageHint: 'Le tuteur rédige dans cette langue, même si vos ressources sont dans une autre.',
    firstNameRequired: 'Indiquez votre prénom.',
    languages: { fr: 'Français', en: 'English', es: 'Español', de: 'Deutsch' },
  },
  rythme: {
    title: 'Votre rythme',
    subtitle:
      'Le tuteur s’en sert pour placer vos séances dans l’agenda. Modifiable à tout moment.',
    hoursLabel: 'Temps d’étude par jour',
    hours: (value: number) => `${String(value)} h`,
    daysLabel: 'Jours d’étude',
    dayLabels: {
      1: 'Lundi',
      2: 'Mardi',
      3: 'Mercredi',
      4: 'Jeudi',
      5: 'Vendredi',
      6: 'Samedi',
      7: 'Dimanche',
    },
    dayShort: { 1: 'L', 2: 'M', 3: 'M', 4: 'J', 5: 'V', 6: 'S', 7: 'D' },
    slotsLabel: 'Moments préférés',
    slots: { matin: 'Matin', apres_midi: 'Après-midi', soir: 'Soir' },
  },
  ia: {
    title: 'Votre IA',
    subtitle:
      'Le tuteur a besoin d’un modèle d’IA. Vous pourrez changer à tout moment dans les paramètres.',
    choicesLabel: 'Choix de l’IA',
    ownLabel: 'Ma propre clé d’IA',
    ownPill: 'Gratuit',
    ownDescription:
      'Vous branchez la clé d’un fournisseur (Anthropic, OpenAI, Mistral…). Learny est gratuit ; vous payez directement votre fournisseur, à l’usage.',
    managedLabel: 'L’IA fournie par Learny',
    managedPill: 'Payant',
    managedDescription:
      'Rien à configurer : le meilleur modèle pour chaque tâche, choisi pour vous.',
    provider: 'Fournisseur',
    providers: {
      anthropic: 'Anthropic · Claude',
      openai: 'OpenAI',
      mistral: 'Mistral',
      openai_compatible: 'Service compatible OpenAI',
    },
    keyLabel: 'Clé d’API',
    keyPlaceholder: 'Collez votre clé',
    baseUrl: 'Adresse du service',
    baseUrlPlaceholder: 'https://…',
    model: 'Nom du modèle',
    test: 'Tester la clé',
    status: {
      untested: 'Pas encore testée',
      testing: 'Test en cours…',
      qualified: 'Clé valide · modèle qualifié pour Learny',
      refused: 'Clé refusée par le fournisseur. Vérifiez-la.',
      bricks:
        'Clé valide, mais ce modèle n’a pas réussi les tests de Learny. Essayez un autre modèle ou l’IA fournie.',
      timeout: 'Le test a pris trop de temps. Réessayez.',
    },
    note: 'Votre clé est chiffrée et ne sert qu’à vos propres demandes. Le test vérifie que le modèle sait produire les briques de Learny (cours, quiz, jeux).',
    continueError: 'Testez votre clé avant de continuer, ou choisissez l’IA fournie.',
    managedTitle: 'Abonnement mensuel, sans engagement.',
    managedCap:
      'Il comprend un plafond d’usage quotidien ; au-delà, le tuteur passe sur un modèle plus léger jusqu’au lendemain.',
    managedPayment:
      'Le paiement se fera à la fin de l’inscription. Vous pourrez revenir à votre propre clé à tout moment.',
  },
  rappels: {
    title: 'Rappels et automatismes',
    subtitle: 'Ce qui vous fera revenir au bon moment, sans vous déranger.',
    push: 'Notifications du navigateur',
    pushDescription:
      'Révisions dues, quiz à venir, cours prêt. Le navigateur vous demandera l’autorisation.',
    email: 'Programme du jour par e-mail',
    emailDescription: 'Chaque matin à 8:00, vos activités du jour.',
    automations: 'Automatismes recommandés',
    automationsDescription:
      'Reprise après une pause, micro-séance de secours, échauffement, révisions lissées.',
    note: 'Heures calmes de 21:00 à 08:00 et 5 notifications par jour au plus. Tout se règle ensuite dans Paramètres.',
  },
  depart: {
    welcome: (firstName: string) => `Bienvenue, ${firstName} !`,
    subtitleVous: 'Votre compte est prêt. Par quoi voulez-vous commencer ?',
    subtitleTu: 'Ton compte est prêt. Par quoi veux-tu commencer ?',
    createTitle: 'Créer ma première formation',
    createDescription:
      'Dites ce que vous voulez apprendre ; le tuteur pose au plus 5 questions, puis propose un programme.',
    inviteTitle: 'Vous avez reçu une invitation ?',
    inviteDescription:
      'Rejoignez une formation à plusieurs : même programme et même agenda, vos apports et vos résultats restent privés.',
    invitePlaceholder: 'Code ou lien d’invitation',
    inviteJoin: 'Rejoindre',
    home: 'Découvrir l’accueil d’abord',
    inviteEmpty: 'Collez le code ou le lien reçu par e-mail.',
    inviteInvalid: 'Ce code d’invitation n’est pas valide.',
    inviteNotFound: 'Ce code d’invitation n’existe pas ou a été régénéré.',
    inviteFull: 'Cette formation compte déjà 10 membres.',
    inviteFormationLimit:
      'Vous suivez déjà 3 formations actives : mettez-en une en pause pour rejoindre celle-ci.',
    inviteAccepted: (title: string, names: string) =>
      names === ''
        ? `Invitation acceptée : « ${title} ».`
        : `Invitation acceptée : « ${title} », avec ${names}.`,
    inviteOpenHome: 'Ouvrir l’accueil',
    paymentActivated: 'Abonnement activé : le tuteur est prêt.',
    paymentPending: 'Paiement reçu, activation en cours. Vous pouvez continuer.',
    paymentCancelled:
      'Le paiement n’a pas abouti : le tuteur restera indisponible tant que vous n’aurez ni abonnement ni clé d’IA.',
    resumePayment: 'Reprendre le paiement',
    useOwnKey: 'Utiliser ma propre clé',
  },
} as const;

export const fr = { onboarding } as const;
