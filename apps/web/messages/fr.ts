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
  },
} as const;

export type Messages = typeof fr;
