export const system = {
  eyebrow: 'Learny',
  error: {
    title: 'Une erreur est survenue',
    body: 'Cette page n’a pas pu s’afficher. Réessayez ; si le problème persiste, revenez à l’accueil.',
    retry: 'Réessayer',
    home: 'Retour à l’accueil',
    requestId: 'Identifiant de requête',
  },
  notFound: {
    title: 'Page introuvable',
    body: 'Cette page n’existe pas ou n’est plus disponible.',
    hint: 'Vérifiez l’adresse ou reprenez depuis l’accueil.',
    home: 'Retour à l’accueil',
    signIn: 'Se connecter',
  },
  accessDenied: {
    title: 'Accès refusé',
    body: 'Vous n’avez pas les droits nécessaires pour afficher cette page.',
    hint: 'Reconnectez-vous avec un compte autorisé ou revenez à l’accueil.',
    home: 'Retour à l’accueil',
    signIn: 'Se connecter',
  },
  offline: {
    title: 'Vous êtes hors ligne',
    body: 'Learny ne peut pas joindre le serveur pour le moment.',
    hint: 'Vérifiez votre connexion puis réessayez. Vos données restent enregistrées sur le serveur.',
    retry: 'Réessayer',
    home: 'Retour à l’accueil',
  },
  loadingPage: {
    title: 'Chargement en cours',
    body: 'La page est en préparation.',
    home: 'Retour à l’accueil',
  },
  loading: 'Chargement…',
} as const;

export const fr = { system } as const;
