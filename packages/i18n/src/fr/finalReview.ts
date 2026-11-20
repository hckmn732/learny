export const finalReview = {
  eyebrow: (formation: string) => formation,
  title: 'Bilan final',
  completed: (date: string, weeks: number | null) =>
    weeks === null
      ? `Formation terminée le ${date}`
      : `Formation terminée le ${date} · ${String(weeks)} semaine${weeks === 1 ? '' : 's'}`,
  result: (percent: number | null) =>
    percent === null ? 'Résultat final indisponible' : `Résultat final : ${String(percent)} %`,
  programVersion: (version: number) => `Programme version ${String(version)}`,
  openMap: 'Ouvrir la carte des notions',
  stats: {
    mastered: (count: number) =>
      count === 1 ? '1 notion acquise' : `${String(count)} notions acquises`,
    masteredLabel: (total: number) =>
      total === 1 ? 'sur 1 notion du programme' : `sur ${String(total)} notions du programme`,
    gaps: (count: number) =>
      count === 0
        ? 'Aucune notion fragile'
        : count === 1
          ? '1 notion fragile'
          : `${String(count)} notions fragiles`,
    gapsLabel: 'à retravailler, sans urgence',
    hours: (label: string) => label,
    hoursLabel: 'de travail effectif, créneaux réalisés',
    retention: (percent: number | null) =>
      percent === null ? 'Pas encore disponible' : `${String(percent)} %`,
    retentionLabel: 'notions retenues à 1 mois',
    retentionTwoMonths: (percent: number | null) =>
      percent === null ? 'Pas encore disponible à 2 mois' : `${String(percent)} % à 2 mois`,
  },
  acquired: {
    title: 'Vos acquis',
    description: (count: number) =>
      count === 0
        ? 'Aucune notion ne dépasse encore le seuil de maîtrise.'
        : count === 1
          ? '1 notion est solide et rejoint votre mémoire durable.'
          : `${String(count)} notions sont solides et rejoignent votre mémoire durable.`,
    empty: 'Aucun acquis mesuré.',
  },
  milestones: {
    title: 'Jalons atteints',
    description: 'Des repères personnels et sobres, sans classement ni récompense de vitesse.',
    empty: 'Aucun jalon atteint pour l’instant.',
    achieved: (date: string) => `Atteint le ${date}`,
  },
  fragile: {
    title: 'Notions fragiles',
    description:
      'Elles restent consultables et peuvent être retravaillées à tout moment, même après l’arrêt des révisions.',
    emptyTitle: 'Aucune notion fragile',
    emptyDescription: 'Toutes vos notions ont atteint le seuil de maîtrise.',
    mastery: (percent: number) => `Maîtrise ${String(percent)} %`,
    train: 'Retravailler',
    module: (position: number) => `Module ${String(position)}`,
  },
  map: {
    title: 'Carte des notions à la date de fin',
    description: 'Chaque point est une notion ; les points orange signalent une notion fragile.',
    module: (position: number) => `Module ${String(position)}`,
    masteredLegend: 'Acquise',
    fragileLegend: 'Fragile',
    upcomingLegend: 'À consolider',
    empty: 'Aucune notion dans le programme.',
  },
  maintenance: {
    title: 'Après la formation',
    description:
      'Votre choix reste modifiable ici. Il règle le quiz global et les rappels de cette formation.',
    light: 'Garder un entretien de mémoire léger',
    lightDescription:
      'Un quiz global limité à 5 minutes par jour, sur les seules notions dues. Un rappel quotidien, sans autre automatisme.',
    stopped: 'Arrêter les révisions',
    stoppedDescription:
      'Plus aucune révision ni notification pour cette formation. Vos résultats et votre historique restent consultables.',
    currentLight: 'Entretien de mémoire léger activé',
    currentStopped: 'Entretien arrêté',
    currentNone: 'Choisissez un mode pour conclure la formation.',
    saving: 'Enregistrement…',
    effects: {
      light: 'Quiz global : 5 min/jour, notions dues uniquement · rappel quotidien actif.',
      stopped: 'Quiz global arrêté pour cette formation · aucun rappel planifié.',
      none: 'Aucun effet tant que vous n’avez pas choisi.',
    },
    due: (count: number) =>
      count === 0
        ? 'Aucune notion due aujourd’hui.'
        : count === 1
          ? '1 notion due aujourd’hui.'
          : `${String(count)} notions dues aujourd’hui.`,
    error: 'Le choix n’a pas pu être enregistré. Réessayez.',
  },
  loading: 'Chargement du bilan…',
  errorTitle: 'Impossible de charger le bilan final.',
  retry: 'Réessayer',
  notFound: 'Ce bilan est introuvable.',
} as const;

export const fr = { finalReview } as const;
