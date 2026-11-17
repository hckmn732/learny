// Legal pages, public footer and accessibility statement (SPEC-806, ADR-0204).
export const legal = {
  eyebrow: 'Informations légales',
  tocTitle: 'Sommaire',
  versionLabel: 'Version',
  effectiveLabel: 'En vigueur le',
  otherDocuments: 'Voir aussi',
  placeholderNotice:
    'Certaines informations d’identité légale sont encore à compléter. Elles seront renseignées avant la publication publique ; aucune valeur n’est inventée.',
  documents: {
    cgu: {
      title: 'Conditions générales d’utilisation',
      description: 'Les règles d’usage de Learny, votre compte et vos contenus.',
    },
    confidentialite: {
      title: 'Politique de confidentialité',
      description: 'Les données traitées, leurs finalités, durées et vos droits.',
    },
    mentions: {
      title: 'Mentions légales',
      description: 'L’éditeur, l’hébergement et les informations légales du service.',
    },
  },
  footer: {
    navLabel: 'Informations légales',
    links: {
      cgu: 'CGU',
      confidentialite: 'Confidentialité',
      mentions: 'Mentions légales',
      accessibilite: 'Accessibilité : partiellement conforme',
    },
  },
  accessibility: {
    eyebrow: 'Accessibilité',
    title: 'Déclaration d’accessibilité',
    introduction:
      'Learny vise le niveau WCAG 2.2 AA. Cette déclaration est partiellement conforme jusqu’à la vérification d’un audit externe.',
    statusLabel: 'Statut',
    status: 'Partiellement conforme',
    measuresTitle: 'Mesures mises en œuvre',
    measures: [
      'Navigation au clavier et focus visible sur les pages publiques et les parcours principaux.',
      'Contrastes vérifiés contre les jetons du design system et respect de la réduction des animations.',
      'Formulaires avec libellés, messages d’erreur explicites et cibles tactiles suffisantes.',
      'Contenus Markdown assainis, sans HTML brut ni script de suivi.',
    ],
    limitsTitle: 'Limites connues',
    limits:
      'Un audit externe n’a pas encore été réalisé. Les contenus générés par le tuteur et les documents importés peuvent conserver des défauts d’accessibilité de leurs auteurs.',
    contactTitle: 'Signaler un problème',
    contact:
      'Pour signaler un obstacle ou demander une alternative, écrivez à l’adresse de contact indiquée dans les mentions légales.',
    backHome: 'Retour à l’accueil',
  },
} as const;

export const fr = { legal } as const;
