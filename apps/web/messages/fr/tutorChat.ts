export const tutorChat = {
  cardTitle: 'Demander au tuteur',
  cardSubtitle: 'Il sait ce que vous lisez',
  chapter: (position: number, title: string) => `Chapitre ${String(position)} · ${title}`,
  resources: (count: number) =>
    count === 0
      ? 'Aucun apport : le tuteur s’appuie sur le cours'
      : count === 1
        ? 'Votre apport, cité en source'
        : `Vos ${String(count)} apports, cités en source`,
  gap: (notion: string) => `Votre lacune : ${notion}`,
  open: 'Ouvrir la discussion',
  tip: 'Astuce : sélectionnez un passage du cours pour le confier au tuteur.',
  panelTitle: 'Tuteur',
  panelSubtitle: (chapter: string) => `Cours · ${chapter}`,
  newDiscussion: 'Nouvelle discussion',
  close: 'Fermer la discussion',
  previous: (count: number) => `Discussions précédentes (${String(count)})`,
  previousEmpty: 'Aucune discussion précédente.',
  contextTitle: 'Contexte transmis au tuteur',
  contextCount: (count: number) => `${String(count)} élément${count === 1 ? '' : 's'}`,
  contextIncluded: 'Inclus',
  contextRetired: 'Retiré',
  contextRemove: (label: string) => `Retirer du contexte : ${label}`,
  contextRestore: (label: string) => `Remettre dans le contexte : ${label}`,
  contextHint:
    'Le tuteur répond à partir de ces éléments et cite vos sources. Retirez ce qui n’aide pas.',
  typing: 'Le tuteur rédige sa réponse…',
  sources: (labels: string) => `Sources : ${labels}`,
  placeholder: 'Posez votre question sur ce chapitre…',
  inputLabel: 'Votre question au tuteur',
  send: 'Envoyer',
  keyboardHelp: 'Entrée pour envoyer · Maj + Entrée pour aller à la ligne · Échap pour fermer',
  selectionRegion: 'Passage sélectionné',
  selectionAsk: 'Demander au tuteur',
  selectionDismiss: 'Ignorer la sélection',
  notSent: 'Non envoyé au tuteur',
  interrupted: 'Réponse interrompue',
  retry: 'Réessayer',
  errorNetwork: 'La réponse n’a pas pu être obtenue.',
  errorUnavailable:
    'Le tuteur n’est pas disponible : aucun modèle d’IA n’est configuré pour la discussion.',
  errorRate: (seconds: number) =>
    `Trop de questions d’un coup : réessayez dans ${String(seconds)} s.`,
  configureModels: 'Régler mes modèles d’IA',
  selfTestIntro: 'Une question, sans regarder le cours :',
  selfTestCorrect: (notion: string, before: number, after: number) =>
    `Je note la réussite : la notion « ${notion} » passe de ${String(before)} % à ${String(after)} % de maîtrise.`,
  selfTestWrongToday: (time: string) =>
    `Je remets cette notion dans votre quiz global de ce soir, à ${time}.`,
  selfTestWrongTomorrow: 'Je remets cette notion dans votre quiz global de demain.',
  passageAdded: (text: string) => `Passage ajouté au contexte : « ${text} »`,
  loading: 'Chargement de la discussion…',
} as const;

export const fr = { tutorChat } as const;
