export const fr = {
  home: {
    title: 'Learny',
    subtitle: 'Application en cours de construction.',
    demoLink: 'Pages de démonstration',
  },
  sdd: {
    clockLabel: 'Horloge du serveur',
    spec001: {
      workspace: {
        title: 'Espace de travail',
        packageHeader: 'Paquet',
        roleHeader: 'Rôle',
      },
      health: {
        title: "Santé de l'API",
        status: 'status',
      },
      regions: {
        title: 'Hébergement (BR-PLA-04)',
        eu: 'UE',
        outsideEu: 'hors UE',
        services: {
          vercel: 'Vercel',
          supabase: 'Supabase',
          inngest: 'Inngest',
        },
      },
      clock: {
        title: 'Horloge injectable',
      },
    },
    spec002: {
      hooks: {
        title: 'Hooks actifs',
        hookHeader: 'Hook',
        commandHeader: 'Commande',
        preCommit: 'lint-staged puis check-secrets --staged',
        commitMsg: 'commitlint --edit',
        prePush: 'typecheck puis test:unit',
        hooksPath: 'core.hooksPath',
        hooksPathUnavailable: 'core.hooksPath indisponible',
      },
      commit: {
        title: 'Vérifier un message de commit',
        label: 'Message de commit',
        submit: 'Vérifier le message',
        valid: 'Message conforme',
        invalid: 'Message refusé',
      },
      secrets: {
        title: 'Détecter un secret',
        label: 'Texte à analyser',
        submit: 'Analyser',
        none: 'Aucun secret détecté.',
        found: (n: number) => `${String(n)} secret(s) détecté(s)`,
        line: 'ligne',
      },
      types: {
        title: 'Types autorisés',
        scopes: 'SPEC-xxx · CP-n · sdd',
      },
      error: 'Vérification impossible. Réessayez.',
    },
    index: {
      title: 'Progression SDD',
      surtitle: 'SDD',
      indicators: {
        total: 'Spécifications',
        done: 'Terminées',
        inProgress: 'En cours',
        blocked: 'Bloquées',
      },
      progressLabel: 'Avancement global',
      v1: 'V1',
      next: {
        title: 'Prochaine action',
        resume: 'Reprendre',
        start: 'Démarrer',
        checkpoint: 'Checkpoint',
        finished: 'Terminé : toutes les spécifications et tous les checkpoints sont validés.',
        stuck: (n: number) => `Aucune spécification exécutable (${String(n)} restante(s)).`,
      },
      phases: {
        title: 'Phases',
        region: 'Tableau des phases',
        phase: 'Phase',
        name: 'Titre',
        done: 'Terminées',
        checkpoint: 'Checkpoint',
        checkpointStatus: 'État du checkpoint',
        checkpointStates: { pending: 'À venir', passed: 'Réussi', failed: 'En échec' },
      },
      specs: {
        title: 'Spécifications',
        region: 'Tableau des spécifications',
        id: 'Identifiant',
        name: 'Titre',
        phase: 'Phase',
        status: 'Statut',
        dependencies: 'Dépendances',
        validations: 'Validations',
        none: '—',
        empty: 'Aucune spécification dans le catalogue.',
      },
      statuses: {
        pending: 'En attente',
        ready: 'Prête',
        waiting: 'En attente de dépendances',
        in_progress: 'En cours',
        done: 'Terminée',
        blocked: 'Bloquée',
        dependency_blocked: 'Bloquée par une dépendance',
      },
      loaded: (done: number, total: number) =>
        `Instantané chargé : ${String(done)} spécification(s) terminée(s) sur ${String(total)}.`,
      refresh: 'Actualiser',
      error: "L'état du référentiel est illisible.",
      requestId: 'Identifiant de requête',
    },
  },
} as const;

export type Messages = typeof fr;
