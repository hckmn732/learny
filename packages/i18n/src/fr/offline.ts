export const offline = {
  banner: 'Mode hors ligne · vos réponses seront envoyées au retour du réseau.',
  dueUnknown: 'Échéance calculée au retour du réseau',
  indicator: {
    offline: 'Hors ligne',
    pending: (count: number) => (count === 1 ? '1 en attente' : `${String(count)} en attente`),
    pendingLabel: (count: number) =>
      count === 1 ? '1 réponse en attente' : `${String(count)} réponses en attente`,
  },
  sync: {
    announceDone: (count: number) =>
      count === 1
        ? 'Synchronisation hors ligne terminée : 1 réponse enregistrée.'
        : `Synchronisation hors ligne terminée : ${String(count)} réponses enregistrées.`,
    done: (count: number) =>
      count === 1 ? '1 réponse synchronisée.' : `${String(count)} réponses synchronisées.`,
    conflict:
      'Certaines réponses avaient déjà été enregistrées sur un autre appareil : la version du serveur est conservée.',
    rejected: (count: number) =>
      count === 1
        ? 'Une réponse hors ligne a été refusée et sera supprimée dans 7 jours.'
        : `${String(count)} réponses hors ligne ont été refusées et seront supprimées dans 7 jours.`,
  },
  page: {
    eyebrow: 'Connexion perdue',
    title: 'Vous êtes hors ligne',
    body: 'Les révisions préparées aujourd’hui restent disponibles. Le reste de Learny reviendra dès que le réseau sera rétabli.',
    review: 'Réviser hors ligne',
    retry: 'Réessayer',
    packsLabel: 'Révisions disponibles hors ligne',
    session: (day: string) => `Session du ${day}`,
    preparedYesterday: 'préparée hier',
    meta: (notions: number, cards: number) =>
      `${notions === 1 ? '1 notion' : `${String(notions)} notions`} · ${
        cards === 1 ? '1 carte de rappel' : `${String(cards)} cartes de rappel`
      }`,
    emptyTitle: 'Aucune révision disponible hors ligne.',
    emptyBody: 'Ouvrez Learny une fois connecté pour préparer les révisions du jour.',
  },
  signOut: {
    title: 'Réponses hors ligne en attente',
    pending: (count: number) =>
      `${String(count)} réponse${count === 1 ? '' : 's'} hors ligne n'${
        count === 1 ? 'a' : 'ont'
      } pas encore été envoyée${count === 1 ? '' : 's'} et sera${count === 1 ? '' : 'ont'} perdue${
        count === 1 ? '' : 's'
      }.`,
    confirm: 'Se déconnecter quand même',
    cancel: 'Annuler',
  },
} as const;

export const fr = { offline } as const;
