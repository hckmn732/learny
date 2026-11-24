// Fiches des stores de Learny (SPEC-3502 EF-4 ; BR-PLA-04, BR-PLA-05, ADR-3006).
//
// Source unique des métadonnées de publication : l'application n'a qu'une fiche, en français
// (BR-ACC-06), déclinée pour l'App Store et Google Play. Les fichiers texte de
// `store/app-store/fr-FR/` et `store/play/fr-FR/` sont les artefacts importés dans les consoles :
// `store/metadata.test.ts` vérifie qu'ils sont identiques à ce module et que chaque champ tient dans
// la limite de la plateforme. Aucune donnée personnelle, aucun secret, aucun prix ici (ADR-3006 § 1).
//
// Les URL publiques utilisent le domaine d'exemple documenté par `docs/engineering/coolify.md` :
// le domaine définitif est une décision du porteur, consignée dans `evidence/SPEC-3502/acceptance.md`.

/** Domaine public de l'application web (docs/engineering/coolify.md, `LEARNY_PUBLIC_APP_URL`). */
export const PUBLIC_WEB_URL = 'https://learny.exemple.fr';

/** Page légale de confidentialité servie par le web (SPEC-806). */
export const PRIVACY_PATH = '/legal/confidentialite';

/** Conditions générales servies par le web (SPEC-806). */
export const TERMS_PATH = '/legal/cgu';

/** Page d'aide servie par le web. */
export const SUPPORT_PATH = '/parametres';

/** Adresse de contact de la fiche (boîte du porteur, jamais un compte personnel d'un apprenant). */
export const SUPPORT_EMAIL = 'support@learny.exemple.fr';

/** Catégorie des deux stores : Éducation (ADR-3006, EF-4). */
export const CATEGORY = 'Éducation';

/** Classification d'âge : aucun contenu sensible, aucun achat, aucun suivi publicitaire. */
export const AGE_RATING = {
  appStore: '4+',
  play: 'Tous publics',
} as const;

/**
 * Limites de longueur des plateformes. Elles sont vérifiées par `metadata.test.ts` ; une fiche qui
 * les dépasse est refusée à l'import par les consoles, donc le test est bloquant.
 */
export const LIMITS = {
  appStore: {
    name: 30,
    subtitle: 30,
    promotionalText: 170,
    description: 4000,
    keywords: 100,
  },
  play: {
    title: 30,
    shortDescription: 80,
    fullDescription: 4000,
  },
} as const;

/** Textes français de la fiche App Store (`store/app-store/fr-FR/`). */
export interface AppStoreFields {
  readonly name: string;
  readonly subtitle: string;
  readonly promotionalText: string;
  readonly description: string;
  /** Mots-clés séparés par des virgules, sans espace après la virgule (format App Store Connect). */
  readonly keywords: string;
  readonly supportUrl: string;
  readonly marketingUrl: string;
  readonly privacyUrl: string;
}

/** Textes français de la fiche Google Play (`store/play/fr-FR/`). */
export interface PlayFields {
  readonly title: string;
  readonly shortDescription: string;
  readonly fullDescription: string;
  readonly privacyUrl: string;
}

const DESCRIPTION = [
  'Learny transforme vos cours en un entraînement quotidien. Déposez un support, choisissez votre rythme : un tuteur IA construit votre programme, vous fait réviser au bon moment et vous dit ce qui reste fragile.',
  '',
  'UN TUTEUR QUI CONNAÎT VOTRE COURS',
  'Posez vos questions sur le chapitre en cours : le tuteur répond à partir de vos documents et cite ses sources. Vous gardez la main sur le contexte qu’il reçoit.',
  '',
  'RÉVISER AU BON MOMENT',
  'Les notions reviennent selon une répétition espacée : cartes de rappel, quiz de validation, défis courts. Chaque session tient dans le temps que vous avez décidé.',
  '',
  'UN PLANNING QUI S’ADAPTE',
  'L’agenda place les activités de la semaine, les décale quand la journée déborde et protège votre série. Vous pouvez mettre votre rythme en pause sans rien perdre.',
  '',
  'HORS LIGNE, SANS PERDRE LE FIL',
  'Les écrans déjà consultés restent lisibles sans réseau. Vos réponses sont mises en file et envoyées dès le retour de la connexion.',
  '',
  'VOS DONNÉES RESTENT À VOUS',
  'Hébergement dans l’Union européenne, export de vos données à tout moment, suppression du compte depuis l’application en trois écrans.',
  '',
  'Learny est gratuit : l’application ne vend aucun abonnement, ne propose aucun achat intégré et n’affiche aucune publicité.',
].join('\n');

const PLAY_DESCRIPTION = DESCRIPTION;

/** Fiche App Store (fr-FR). */
export const APP_STORE: AppStoreFields = {
  name: 'Learny',
  subtitle: 'Apprendre avec un tuteur IA',
  promotionalText:
    'Votre cours devient un programme quotidien : révisions espacées, quiz de validation et tuteur qui cite vos sources.',
  description: DESCRIPTION,
  keywords:
    'apprentissage,formation,quiz,révisions,tuteur IA,répétition espacée,SAP,comptabilité,mémorisation',
  supportUrl: `${PUBLIC_WEB_URL}${SUPPORT_PATH}`,
  marketingUrl: PUBLIC_WEB_URL,
  privacyUrl: `${PUBLIC_WEB_URL}${PRIVACY_PATH}`,
};

/** Fiche Google Play (fr-FR). */
export const PLAY: PlayFields = {
  title: 'Learny',
  shortDescription: 'Votre formation, révisée chaque jour par un tuteur IA.',
  fullDescription: PLAY_DESCRIPTION,
  privacyUrl: `${PUBLIC_WEB_URL}${PRIVACY_PATH}`,
};

/**
 * Fiche de confidentialité des stores : exactement les données traitées par l'application
 * (BR-PLA-04, BR-PLA-05, ET-3, ET-4). `purpose` reprend la finalité du registre des traitements
 * (SPEC-806) et `thirdParty` nomme le sous-traitant, jamais un usage publicitaire.
 */
export interface PrivacyDataUse {
  /** Libellé de la catégorie du store (App Store « App Privacy », Play « Data safety »). */
  readonly category: string;
  /** Donnée réellement traitée. */
  readonly data: string;
  readonly purpose: string;
  readonly linkedToUser: boolean;
  readonly usedForTracking: boolean;
  /** Sous-traitants ou tiers techniques concernés ; vide quand la donnée ne sort pas de l'UE. */
  readonly thirdParty: readonly string[];
}

export const PRIVACY_DATA_USES: readonly PrivacyDataUse[] = [
  {
    category: 'Coordonnées',
    data: 'Adresse e-mail',
    purpose: 'Créer le compte, connecter par lien magique, envoyer les rappels demandés.',
    linkedToUser: true,
    usedForTracking: false,
    thirdParty: ['Supabase (hébergement UE)'],
  },
  {
    category: 'Coordonnées',
    data: 'Prénom et nom',
    purpose: 'Afficher l’identité de l’apprenant dans l’application.',
    linkedToUser: true,
    usedForTracking: false,
    thirdParty: ['Supabase (hébergement UE)'],
  },
  {
    category: 'Contenu utilisateur',
    data: 'Cours importés et questions posées au tuteur',
    purpose: 'Produire la formation, répondre aux questions et citer les sources.',
    linkedToUser: true,
    usedForTracking: false,
    thirdParty: ['Fournisseur de modèle d’IA choisi par l’apprenant'],
  },
  {
    category: 'Activité',
    data: 'Progression, réponses aux quiz, série et lacunes',
    purpose: 'Calculer le planning, les révisions espacées et les indicateurs.',
    linkedToUser: true,
    usedForTracking: false,
    thirdParty: [],
  },
  {
    category: 'Identifiants',
    data: 'Jeton de notification de l’appareil (FCM ou APNs)',
    purpose: 'Envoyer les rappels de révision demandés.',
    linkedToUser: true,
    usedForTracking: false,
    thirdParty: ['Apple (APNs)', 'Google (FCM)'],
  },
  {
    category: 'Diagnostics',
    data: 'Aucune donnée de diagnostic collectée',
    purpose: 'Sentry n’est pas configuré dans cette version (ET-4) : aucune télémétrie.',
    linkedToUser: false,
    usedForTracking: false,
    thirdParty: [],
  },
];

/**
 * API à raison requise déclarées par `PrivacyInfo.xcprivacy` (ET-3). Les quatre catégories sont
 * celles qu'utilisent React Native, Expo et le stockage chiffré ; aucune n'est utilisée pour suivre
 * l'apprenant.
 */
export const REQUIRED_REASON_APIS = [
  {
    category: 'NSPrivacyAccessedAPICategoryFileTimestamp',
    reason: 'C617.1',
    why: 'Expo lit la date des fichiers de son propre bac à sable (cache, polices embarquées).',
  },
  {
    category: 'NSPrivacyAccessedAPICategoryUserDefaults',
    reason: 'CA92.1',
    why: 'React Native et le stockage local écrivent les préférences de l’application.',
  },
  {
    category: 'NSPrivacyAccessedAPICategorySystemBootTime',
    reason: '35F9.1',
    why: 'React Native mesure les durées d’animation et de démarrage.',
  },
  {
    category: 'NSPrivacyAccessedAPICategoryDiskSpace',
    reason: 'E174.1',
    why: 'Le cache hors ligne vérifie l’espace disponible avant d’écrire.',
  },
] as const;

/**
 * Vérifie qu'un champ tient dans la limite de la plateforme. Exporté pour que le test et la page de
 * démonstration partagent exactement la même règle.
 */
export function withinLimit(value: string, limit: number): boolean {
  return Array.from(value).length <= limit;
}
