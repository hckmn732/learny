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
  },
} as const;

export type Messages = typeof fr;
