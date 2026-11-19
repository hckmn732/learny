export const auth = {
  layout: {
    label: 'Learny',
    tagline: ['Apprenez vite.', 'Retenez longtemps.'],
    intro:
      'Un tuteur IA conçoit votre parcours, transforme vos ressources en cours, vous entraîne et vous fait réviser au bon moment.',
    benefits: [
      'Des cours construits à partir de vos propres ressources, sources citées',
      'Des révisions espacées pour ne pas oublier',
      'Gratuit avec votre propre clé d’IA',
    ],
    steps: {
      compte: 'Compte',
      verification: 'Vérification',
      profil: 'Profil',
      rythme: 'Rythme',
      ia: 'IA',
      rappels: 'Rappels',
      depart: 'Départ',
    },
    stepCounter: (position: number, total: number, label: string) =>
      `Étape ${String(position)} sur ${String(total)} · ${label}`,
    stepAria: (position: number, label: string, state: 'done' | 'current' | 'upcoming') =>
      `Étape ${String(position)} : ${label}${
        state === 'done' ? ', faite' : state === 'current' ? ', en cours' : ''
      }`,
    signInCounter: 'Connexion',
    stepsLabel: 'Étapes de l’inscription',
  },
  account: {
    emailLabel: 'Adresse e-mail',
    emailPlaceholder: 'vous@exemple.fr',
    methodsLabel: 'Façon de se connecter',
    magicLabel: 'Recevoir un lien de connexion',
    magicDescription: 'Sans mot de passe : un lien valable 1 heure, envoyé par e-mail.',
    passwordSignupLabel: 'Choisir un mot de passe',
    passwordSignupDescription: '12 caractères au moins.',
    passwordLoginLabel: 'Avec mon mot de passe',
    passwordLoginDescription: 'Connexion immédiate.',
    passwordLabel: 'Mot de passe',
    passwordPlaceholder: '12 caractères au moins',
    strengthLabel: 'Solidité du mot de passe',
    strengthEmpty: '12 caractères au moins ; une phrase facile à retenir fonctionne bien.',
    strengthStrong: 'Mot de passe solide.',
    strengthWeak: 'Encore un effort : allongez-le, ajoutez un chiffre ou un symbole.',
    termsBefore: 'J’accepte les ',
    termsCgu: 'conditions d’utilisation',
    termsAnd: ' et la ',
    termsPrivacy: 'politique de confidentialité',
    termsAfter: '. Mes ressources restent privées.',
    legalNewTab: ' (nouvel onglet)',
  },
  signup: {
    title: 'Créer votre compte',
    subtitle: 'Deux minutes pour démarrer, sans carte bancaire.',
    switchText: 'Déjà un compte ?',
    switchCta: 'Se connecter',
  },
  signIn: {
    title: 'Bon retour',
    subtitle: 'Connectez-vous pour reprendre là où vous en étiez.',
    switchText: 'Pas encore de compte ?',
    switchCta: 'Créer un compte',
  },
  submit: {
    signupMagic: 'Recevoir mon lien',
    signupPassword: 'Créer mon compte',
    loginMagic: 'Recevoir mon lien de connexion',
    loginPassword: 'Se connecter',
  },
  validation: {
    email: 'Saisissez une adresse e-mail valide.',
    passwordSignup: 'Le mot de passe doit faire 12 caractères au moins.',
    passwordLogin: 'Saisissez votre mot de passe.',
    terms: 'Acceptez les conditions pour créer votre compte.',
  },
  errors: {
    linkExpired: 'Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.',
    invalidCredentials: 'Adresse e-mail ou mot de passe incorrect.',
    rateLimited: 'Trop de tentatives. Réessayez dans quelques minutes.',
    network: 'Connexion au service impossible. Vérifiez votre réseau et réessayez.',
    resendWait: (seconds: number) => `Patientez encore ${String(seconds)} s avant un nouvel envoi.`,
    confirmationResent: 'Confirmez d’abord votre adresse : nous venons de vous renvoyer le lien.',
    linkNotOpened:
      'Le lien n’a pas encore été ouvert sur ce navigateur. Ouvrez-le depuis l’e-mail reçu.',
  },
  verify: {
    title: 'Vérifiez votre boîte mail',
    back: 'Retour',
    confirm: 'J’ai cliqué sur le lien',
    magicText: (email: string) =>
      `Nous avons envoyé un lien de connexion à ${email}. Ouvrez-le sur cet appareil pour continuer.`,
    passwordText: (email: string) =>
      `Nous avons envoyé un lien de confirmation à ${email}. Ouvrez-le sur cet appareil pour continuer.`,
    unknownAddress: 'votre adresse',
    resendBefore: 'Rien reçu ? Regardez dans les indésirables, ou ',
    resend: 'renvoyez le lien',
    resendAfter: '.',
    resendCountdown: (seconds: number) => `renvoyez le lien (dans ${String(seconds)} s)`,
    resent: 'Nouveau lien envoyé. Il reste valable 1 heure.',
  },
  noscript: 'Activez JavaScript pour utiliser Learny.',
} as const;

export const fr = { auth } as const;
