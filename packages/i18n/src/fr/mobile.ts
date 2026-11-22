// Messages propres à l'application mobile : espace `mobile` de `@learny/i18n` (canevas § 2,
// ADR-3005 § 3). Textes vus par l'utilisateur, en français (BR-ACC-06), ton neutre vouvoiement.
export const mobile = {
  sdd: {
    spec3001: {
      eyebrow: 'Démonstration SDD',
      title: 'SPEC-3001 · socle mobile',
      versionLabel: 'Version de l’application',
      runtimeLabel: 'Version du runtime',
      apiLabel: 'URL de l’API',
      clockLabel: 'Horloge (Europe/Paris)',
      healthLabel: 'Santé de l’API',
      healthChecking: 'Vérification…',
      healthOk: 'API joignable',
      healthUnreachable: 'API injoignable',
      healthCodeLabel: 'Code',
      platformLabel: 'Plateforme',
      footer: 'Page de démonstration visible seulement si EXPO_PUBLIC_ENABLE_SDD_PAGES=1.',
    },
  },
  config: {
    title: 'Configuration invalide',
    intro:
      'L’application ne peut pas démarrer : la configuration publique est incomplète ou mal formée. Aucune valeur n’est affichée, seulement le nom des clés.',
    missingTitle: 'Clés manquantes',
    invalidTitle: 'Clés invalides',
  },
  home: {
    placeholderTitle: 'Learny',
    placeholderBody:
      'Le socle mobile est installé. Activez les pages de démonstration SDD pour ouvrir la page de SPEC-3001.',
  },
} as const;

export type MobileMessages = typeof mobile;
