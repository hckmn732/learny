export const search = {
  label: 'Rechercher',
  placeholder: 'Rechercher une notion, un cours, une formation…',
  suggestionsLabel: 'Suggestions de recherche',
  resultsLabel: 'Résultats de recherche',
  shortHint: 'Saisissez au moins 2 caractères pour lancer la recherche.',
  loading: 'Recherche en cours…',
  loadingAnnouncement: 'Recherche en cours.',
  empty: (query: string) => `Aucun résultat pour « ${query} ».`,
  error: 'La recherche a échoué. Vérifiez votre connexion puis réessayez.',
  retry: 'Réessayer',
  viewAll: 'Voir tous les résultats',
  openResult: (title: string) => `Ouvrir ${title}`,
  resultCount: (count: number) =>
    count === 0 ? 'Aucun résultat' : count === 1 ? '1 résultat' : `${String(count)} résultats`,
  announcement: (count: number) =>
    count === 0
      ? 'Aucun résultat.'
      : count === 1
        ? '1 résultat disponible.'
        : `${String(count)} résultats disponibles.`,
  types: {
    notion: 'Notion',
    chapter: 'Chapitre',
    formation: 'Formation',
  },
  page: {
    eyebrow: 'Recherche globale',
    title: 'Résultats de recherche',
    query: (query: string) => `Résultats pour « ${query} »`,
    total: (count: number) =>
      count === 0 ? 'Aucun résultat' : count === 1 ? '1 résultat' : `${String(count)} résultats`,
    groupTotal: (shown: number, total: number) =>
      shown >= total
        ? total === 1
          ? '1 résultat'
          : `${String(total)} résultats`
        : `${String(shown)} sur ${String(total)} résultats`,
    shortTitle: 'Précisez votre recherche',
    shortDescription:
      'Saisissez au moins 2 caractères : la recherche couvre vos notions, vos chapitres et vos formations.',
    emptyTitle: 'Aucun résultat',
    emptyDescription: (query: string) =>
      `Aucun résultat pour « ${query} ». Vérifiez l’orthographe ou essayez un autre mot.`,
    errorTitle: 'Recherche indisponible',
    errorDescription: 'La recherche n’a pas pu aboutir. Vérifiez votre connexion puis réessayez.',
    retry: 'Réessayer',
    resultsSummary: (query: string, total: number) =>
      total === 0
        ? `Aucun résultat pour « ${query} ».`
        : total === 1
          ? `1 résultat pour « ${query} ».`
          : `${String(total)} résultats pour « ${query} ».`,
    typeLabel: 'Type',
    snippetLabel: 'Extrait',
  },
} as const;

export const fr = { search } as const;
