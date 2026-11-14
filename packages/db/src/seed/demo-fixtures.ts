// Source structurée du jeu de démonstration (SPEC-115 ET-2, ADR-0250).
//
// Chaque valeur visible critique porte un `source` qui cite l'écran SCR-xx et le fichier de
// maquette ; les maquettes restent en lecture seule. Les identifiants sont des UUID v5 du namespace
// `learny-demo`, donc stables d'une exécution à l'autre et distincts des identifiants aléatoires des
// fabriques. Aucun mot de passe, aucune clé et aucune adresse réelle ne figurent ici : le domaine
// `demo.learny.test` est réservé aux tests (ET-7).
import { createHash } from 'node:crypto';

export const DEMO_NOW_ISO = '2026-11-11T12:20:00Z';
export const DEMO_TIME_ZONE = 'Europe/Paris';
export const DEMO_LOCAL_TIME = '13:20';
export const DEMO_SECOND = '2026-11-11T13:20:00+01:00';

/** Namespace DNS de la RFC 4122, puis namespace applicatif dérivé. */
const NAMESPACE_DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

function parseUuid(value: string): Buffer {
  const hex = value.replaceAll('-', '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error(`UUID invalide : ${value}`);
  return Buffer.from(hex, 'hex');
}

function formatUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** UUID v5 (SHA-1) conforme à la RFC 4122. */
function uuidV5(name: string, namespace: string): string {
  const hash = createHash('sha1').update(parseUuid(namespace)).update(name, 'utf8').digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  return formatUuid(bytes);
}

/** Namespace `learny-demo`, dérivé du namespace DNS. */
export const DEMO_NAMESPACE = uuidV5('learny-demo', NAMESPACE_DNS);

/** Identifiant stable d'une entité du jeu de démonstration. */
export function demoId(...parts: readonly string[]): string {
  if (parts.length === 0 || parts.some((part) => part.trim() === '')) {
    throw new Error('demoId : au moins une partie non vide est attendue.');
  }
  return uuidV5(parts.join(':'), DEMO_NAMESPACE);
}

export interface DemoSource {
  /** Écran de la maquette (SCR-xx) ou `fixture` pour une valeur minimale de fonctionnement. */
  screen: string;
  /** Fichier de maquette observé, relatif à `design/maquettes/`. */
  file: string;
  /** Élément observé dans la maquette. */
  element: string;
}

export type DemoFormationKey = 'sap' | 'agile' | 'python' | 'excel' | 'english';
export type DemoUserKey = 'alex' | 'camille' | 'hugo';
export type DemoGapNature = 'forgetting' | 'confusion' | 'misunderstanding' | 'application';
export type DemoSlotKind =
  | 'contributions'
  | 'course'
  | 'exercise'
  | 'validation_quiz'
  | 'global_quiz'
  | 'revision'
  | 'buffer'
  | 'sprint'
  | 'mock_exam'
  | 'warmup'
  | 'micro_session'
  | 'weekly_review';

export interface DemoUserFixture {
  key: DemoUserKey;
  firstName: string;
  lastName: string;
  email: string;
  source: DemoSource;
}

/** Comptes fictifs ; les tests e2e réutilisent ces identifiants sans mot de passe en dur (EF-7). */
export const DEMO_USERS: readonly DemoUserFixture[] = [
  {
    key: 'alex',
    firstName: 'Alex',
    lastName: 'Perrin',
    email: 'alex.perrin@demo.learny.test',
    source: {
      screen: 'SCR-03',
      file: 'Main.dc.html',
      element: 'avatar AP, « Apprenant », menu Mon compte',
    },
  },
  {
    key: 'camille',
    firstName: 'Camille',
    lastName: 'Roussel',
    email: 'camille.roussel@demo.learny.test',
    source: {
      screen: 'fixture',
      file: 'Main.dc.html',
      element: 'membre du groupe « Gestion de projet agile » (prénom repris de la spec)',
    },
  },
  {
    key: 'hugo',
    firstName: 'Hugo',
    lastName: 'Marchand',
    email: 'hugo.marchand@demo.learny.test',
    source: {
      screen: 'fixture',
      file: 'Main.dc.html',
      element: 'membre du groupe « Gestion de projet agile » (prénom repris de la spec)',
    },
  },
] as const;

export function demoUserId(key: DemoUserKey): string {
  return demoId('user', key);
}

export const DEMO_PROFILE = {
  userId: demoUserId('alex'),
  onboardingStep: 'done',
  tutorTone: 'vous',
  courseLanguage: 'fr',
  timezone: DEMO_TIME_ZONE,
  streakDays: 12,
  // SPEC-701 CA-8: the streak of 11 November is counted at the closure of the daily quiz.
  streakComputedOn: '2026-11-10',
  termsVersion: '2026-10-01',
  source: {
    screen: 'SCR-03',
    file: 'Main.dc.html',
    element: 'série « 12 jours », compte Europe/Paris',
  } satisfies DemoSource,
} as const;

export const DEMO_PREFERENCES = {
  hoursPerDay: 5,
  studyDays: [1, 2, 3, 4, 5] as const,
  preferredSlots: ['matin', 'apres_midi'] as const,
  source: {
    screen: 'SCR-15',
    file: 'Parametres.dc.html',
    element: 'rythme : 5 h d’étude, jours d’étude, moments préférés',
  } satisfies DemoSource,
} as const;

export const DEMO_NOTIFICATION_SETTINGS = {
  channelEmail: true,
  channelPush: true,
  digestTime: '08:00:00',
  quietStart: '21:00:00',
  quietEnd: '08:00:00',
  weekendQuiet: true,
  maxPerDay: 5,
  source: {
    screen: 'SCR-15',
    file: 'Parametres.dc.html',
    element: 'programme du jour 08:00, heures calmes 21:00–08:00, maximum 5',
  } satisfies DemoSource,
} as const;

export const DEMO_AUTOMATIONS = [
  { key: 'reprise', enabled: true, params: { windowHours: 24 } },
  { key: 'micro_seance', enabled: true, params: { maxMinutes: 5 } },
  { key: 'echauffement', enabled: true, params: { questions: 3 } },
  { key: 'remediation', enabled: true, params: { minutes: 60 } },
  { key: 'jeu_lacune', enabled: true, params: { games: 5 } },
  { key: 'questions_cartes', enabled: true, params: { perDay: 3 } },
  { key: 'plafond_quiz', enabled: true, params: { maxMinutes: 15 } },
  { key: 'sprint', enabled: true, params: { minutes: 30 } },
  { key: 'bilan', enabled: true, params: { day: 7, time: '19:00' } },
  { key: 'pause', enabled: true, params: { diagnostic: true } },
] as const;

export interface DemoChapterFixture {
  key: string;
  title: string;
}

export interface DemoNotionFixture {
  key: string;
  /** Identifiant court repris de la carte (ex. `cle`), pour les liens. */
  slug: string;
  label: string;
  definition: string;
  chapterKey: string;
  /** Maîtrise observée sur la carte ; `null` = pas encore vue. */
  mastery: number | null;
  gap?: {
    nature: DemoGapNature;
    confusedWith?: string;
    evidence?: string;
  };
  /** Présente dans le quiz global du jour (14 notions). */
  inReview?: boolean;
}

export interface DemoModuleFixture {
  key: string;
  position: number;
  title: string;
  short: string;
  plannedStart: string;
  plannedEnd: string;
  chapters: readonly DemoChapterFixture[];
  notions: readonly DemoNotionFixture[];
}

export interface DemoFormationFixture {
  key: DemoFormationKey;
  title: string;
  /** ADR-0162 — stored sigil shown on the home and sidebar cards. */
  monogram: string;
  /** ADR-0162 — stable accent of the cards and progress rings. */
  accentColor: 'indigo' | 'green' | 'orange' | 'violet' | 'teal';
  description: string;
  objectives: readonly ('operational' | 'exam' | 'dialogue' | 'project')[];
  status: 'cadrage' | 'programme_proposed' | 'active' | 'paused' | 'completed' | 'archived';
  volumeHours: number | null;
  startDate: string | null;
  endDate: string | null;
  defaultThreshold: number;
  currentModulePosition: number | null;
  progressPercent: number;
  nextActivity: string;
  nextActivityAt: string | null;
  maintenanceMode: 'light' | 'stopped' | null;
  resultPercent: number | null;
  retentionPercent: number | null;
  dueNotionCount: number;
  group: boolean;
  source: DemoSource;
  modules: readonly DemoModuleFixture[];
}

function moduleKey(formation: DemoFormationKey, position: number): string {
  return `${formation}:m${String(position)}`;
}

function chapterKey(formation: DemoFormationKey, modulePosition: number, index: number): string {
  return `${moduleKey(formation, modulePosition)}:c${String(index)}`;
}

function notionKey(
  formation: DemoFormationKey,
  modulePosition: number,
  chapterIndex: number,
  index: number,
): string {
  return `${chapterKey(formation, modulePosition, chapterIndex)}:n${String(index)}`;
}

/** Définitions observées dans `Carte.dc.html` (`DESC`) ; les autres sont des fixtures minimales. */
const NOTION_DEFINITIONS: Readonly<Record<string, string>> = {
  cle: 'Code à deux chiffres porté par chaque poste : il fixe le sens (débit ou crédit) et le type de compte.',
  type: 'Classe toute la pièce (SA, KR, DR) et fixe sa numérotation, choisie dans l’en-tête.',
  piece:
    'Écriture enregistrée sous forme de pièce : un en-tête qui décrit l’opération et des postes qui portent les montants.',
  entete: 'Dates, type de pièce, société et devise : ce qui décrit toute l’opération.',
  poste: 'Une ligne de la pièce : un compte, un montant et une clé de comptabilisation.',
  dates: 'Fixe la période où l’écriture compte, distincte de la date du document d’origine.',
  equilibre: 'Une pièce n’est enregistrée que si le total des débits égale le total des crédits.',
  acdoca:
    'Table unique où S/4HANA enregistre tous les postes : comptabilité générale, analytique et immobilisations.',
  ledgers:
    'Plusieurs ledgers tiennent la même comptabilité selon des normes différentes, par exemple locales et IFRS.',
  ledger: 'Ensemble de comptes tenu selon une norme ; le ledger principal s’appelle 0L.',
  compte: 'Compte du plan comptable sur lequel portent les postes.',
  partie:
    'Tout montant débité quelque part est crédité ailleurs : l’origine de l’équilibre des pièces.',
  variante: 'Définit l’exercice et ses périodes comptables, rattachée à chaque société.',
  societe: 'Unité qui tient une comptabilité complète et établit ses propres états financiers.',
  pc: 'Liste des comptes généraux utilisés par une ou plusieurs sociétés.',
  fiori: 'L’interface de S/4HANA, organisée en applications par rôle.',
};

interface NotionSeed {
  key: string;
  label: string;
  mastery: number | null;
  gap?: DemoNotionFixture['gap'];
  inReview?: boolean;
}

function sapChapter(
  formation: DemoFormationKey,
  modulePosition: number,
  chapterIndex: number,
  title: string,
): DemoChapterFixture {
  return { key: chapterKey(formation, modulePosition, chapterIndex), title };
}

function sapNotions(
  formation: DemoFormationKey,
  modulePosition: number,
  chapterIndex: number,
  notions: readonly NotionSeed[],
): DemoNotionFixture[] {
  return notions.map((notion, index) => ({
    key: notionKey(formation, modulePosition, chapterIndex, index + 1),
    slug: notion.key,
    label: notion.label,
    definition:
      NOTION_DEFINITIONS[notion.key] ??
      `Notion « ${notion.label} » du programme SAP S/4HANA Finance.`,
    chapterKey: chapterKey(formation, modulePosition, chapterIndex),
    mastery: notion.mastery,
    ...(notion.gap === undefined ? {} : { gap: notion.gap }),
    ...(notion.inReview === undefined ? {} : { inReview: notion.inReview }),
  }));
}

const SAP: DemoFormationKey = 'sap';

/** Les 7 modules et 24 chapitres de `Programme.dc.html`, et les 48 notions de `Carte.dc.html`. */
const SAP_MODULES: readonly DemoModuleFixture[] = [
  {
    key: moduleKey(SAP, 1),
    position: 1,
    title: 'Fondamentaux de SAP S/4HANA et navigation Fiori',
    short: 'Fondamentaux et Fiori',
    plannedStart: '2026-11-02',
    plannedEnd: '2026-11-04',
    chapters: [
      sapChapter(SAP, 1, 1, 'Architecture de SAP S/4HANA'),
      sapChapter(SAP, 1, 2, 'Navigation dans SAP Fiori'),
      sapChapter(SAP, 1, 3, 'Données de base et transactions clés'),
    ],
    notions: [
      ...sapNotions(SAP, 1, 1, [
        { key: 's4', label: 'SAP S/4HANA', mastery: 92 },
        { key: 'fiori', label: 'SAP Fiori', mastery: 90, inReview: true },
        { key: 'role', label: 'Rôle utilisateur', mastery: 82, inReview: true },
      ]),
      ...sapNotions(SAP, 1, 2, [
        { key: 'launchpad', label: 'Launchpad Fiori', mastery: 88, inReview: true },
        { key: 'appli', label: 'Application Fiori', mastery: 85, inReview: true },
      ]),
      ...sapNotions(SAP, 1, 3, [
        { key: 'bp', label: 'Partenaire (Business Partner)', mastery: 84, inReview: true },
        { key: 'donnees', label: 'Données de base', mastery: 86, inReview: true },
      ]),
    ],
  },
  {
    key: moduleKey(SAP, 2),
    position: 2,
    title: 'Structure organisationnelle de la Finance',
    short: 'Structure organisationnelle',
    plannedStart: '2026-11-05',
    plannedEnd: '2026-11-06',
    chapters: [
      sapChapter(SAP, 2, 1, 'Sociétés et périmètres comptables'),
      sapChapter(SAP, 2, 2, 'Devises et variantes d’exercice'),
      sapChapter(SAP, 2, 3, 'Paramètres de saisie'),
    ],
    notions: [
      ...sapNotions(SAP, 2, 1, [
        { key: 'societe', label: 'Société', mastery: 90, inReview: true },
        { key: 'pc', label: 'Plan comptable', mastery: 88, inReview: true },
        { key: 'perimetre', label: 'Périmètre analytique', mastery: 81, inReview: true },
        { key: 'segment', label: 'Segment', mastery: 80, inReview: true },
      ]),
      ...sapNotions(SAP, 2, 2, [
        {
          key: 'variante',
          label: 'Variante d’exercice',
          mastery: 60,
          gap: {
            nature: 'forgetting',
            evidence: 'Confondue avec la période comptable lors de la révision du 8 novembre.',
          },
          inReview: true,
        },
        { key: 'devise', label: 'Devise de la société', mastery: 85, inReview: true },
        { key: 'division', label: 'Division', mastery: 82, inReview: true },
      ]),
      ...sapNotions(SAP, 2, 3, [
        { key: 'cdp', label: 'Centre de profit', mastery: 83, inReview: true },
        { key: 'ledger', label: 'Ledger', mastery: 84 },
      ]),
    ],
  },
  {
    key: moduleKey(SAP, 3),
    position: 3,
    title: 'Comptabilité générale',
    short: 'Comptabilité générale',
    plannedStart: '2026-11-09',
    plannedEnd: '2026-11-13',
    chapters: [
      sapChapter(SAP, 3, 1, 'Plan comptable et comptes généraux'),
      sapChapter(SAP, 3, 2, 'Saisie des pièces comptables'),
      sapChapter(SAP, 3, 3, 'Journal universel (ACDOCA)'),
      sapChapter(SAP, 3, 4, 'Ledgers parallèles'),
    ],
    notions: [
      ...sapNotions(SAP, 3, 1, [
        { key: 'compte', label: 'Compte général', mastery: 87 },
        { key: 'partie', label: 'Partie double', mastery: 90 },
      ]),
      ...sapNotions(SAP, 3, 2, [
        { key: 'piece', label: 'Pièce comptable', mastery: 88 },
        { key: 'entete', label: 'En-tête de pièce', mastery: 86 },
        { key: 'poste', label: 'Poste', mastery: 84 },
        {
          key: 'cle',
          label: 'Clé de comptabilisation',
          mastery: 35,
          gap: {
            nature: 'confusion',
            confusedWith: 'type',
            evidence: 'Confondue avec le type de pièce, deux fois (9 et 10 novembre).',
          },
        },
        { key: 'type', label: 'Type de pièce', mastery: 81 },
        { key: 'dates', label: 'Date comptable', mastery: 83 },
        {
          key: 'equilibre',
          label: 'Équilibre d’une pièce',
          mastery: 55,
          gap: {
            nature: 'application',
            evidence: 'Équilibre non vérifié sur une saisie d’exercice le 10 novembre.',
          },
        },
      ]),
      ...sapNotions(SAP, 3, 3, [
        { key: 'acdoca', label: 'Journal universel (ACDOCA)', mastery: 82 },
      ]),
      ...sapNotions(SAP, 3, 4, [
        {
          key: 'ledgers',
          label: 'Ledgers parallèles',
          mastery: 28,
          gap: {
            nature: 'misunderstanding',
            evidence: 'Explication non retenue après la séance du 10 novembre.',
          },
        },
      ]),
    ],
  },
  {
    key: moduleKey(SAP, 4),
    position: 4,
    title: 'Comptabilité fournisseurs',
    short: 'Comptabilité fournisseurs',
    plannedStart: '2026-11-16',
    plannedEnd: '2026-11-20',
    chapters: [
      sapChapter(SAP, 4, 1, 'Données de base fournisseurs'),
      sapChapter(SAP, 4, 2, 'Factures fournisseurs'),
      sapChapter(SAP, 4, 3, 'Paiements'),
      sapChapter(SAP, 4, 4, 'Rapprochement des comptes'),
    ],
    notions: [
      ...sapNotions(SAP, 4, 1, [
        { key: 'fourn', label: 'Fournisseur', mastery: null },
        { key: 'collectif', label: 'Compte collectif', mastery: null },
      ]),
      ...sapNotions(SAP, 4, 2, [{ key: 'factf', label: 'Facture fournisseur', mastery: null }]),
      ...sapNotions(SAP, 4, 3, [
        { key: 'paiement', label: 'Paiement', mastery: null },
        { key: 'progpaie', label: 'Programme de paiement', mastery: null },
      ]),
      ...sapNotions(SAP, 4, 4, [{ key: 'compensation', label: 'Compensation', mastery: null }]),
    ],
  },
  {
    key: moduleKey(SAP, 5),
    position: 5,
    title: 'Comptabilité clients',
    short: 'Comptabilité clients',
    plannedStart: '2026-11-23',
    plannedEnd: '2026-11-27',
    chapters: [
      sapChapter(SAP, 5, 1, 'Données de base clients'),
      sapChapter(SAP, 5, 2, 'Factures clients'),
      sapChapter(SAP, 5, 3, 'Encaissements'),
      sapChapter(SAP, 5, 4, 'Relances'),
    ],
    notions: [
      ...sapNotions(SAP, 5, 1, [{ key: 'client', label: 'Client', mastery: null }]),
      ...sapNotions(SAP, 5, 2, [{ key: 'factc', label: 'Facture client', mastery: null }]),
      ...sapNotions(SAP, 5, 3, [
        { key: 'encaissement', label: 'Encaissement', mastery: null },
        { key: 'credit', label: 'Gestion du crédit', mastery: null },
      ]),
      ...sapNotions(SAP, 5, 4, [{ key: 'relance', label: 'Relance', mastery: null }]),
    ],
  },
  {
    key: moduleKey(SAP, 6),
    position: 6,
    title: 'Immobilisations',
    short: 'Immobilisations',
    plannedStart: '2026-11-30',
    plannedEnd: '2026-12-04',
    chapters: [
      sapChapter(SAP, 6, 1, 'Fiches d’immobilisation'),
      sapChapter(SAP, 6, 2, 'Acquisitions et cessions'),
      sapChapter(SAP, 6, 3, 'Amortissements'),
    ],
    notions: [
      ...sapNotions(SAP, 6, 1, [
        { key: 'immo', label: 'Immobilisation', mastery: null },
        { key: 'classe', label: 'Classe d’immobilisation', mastery: null },
      ]),
      ...sapNotions(SAP, 6, 2, [{ key: 'rebut', label: 'Sortie d’immobilisation', mastery: null }]),
      ...sapNotions(SAP, 6, 3, [
        { key: 'amort', label: 'Amortissement', mastery: null },
        { key: 'domaine', label: 'Domaine d’évaluation', mastery: null },
      ]),
    ],
  },
  {
    key: moduleKey(SAP, 7),
    position: 7,
    title: 'Clôture de période et préparation à la certification',
    short: 'Clôture et certification',
    plannedStart: '2026-12-07',
    plannedEnd: '2026-12-11',
    chapters: [
      sapChapter(SAP, 7, 1, 'Clôture mensuelle'),
      sapChapter(SAP, 7, 2, 'Clôture annuelle'),
      sapChapter(SAP, 7, 3, 'Examen blanc de certification'),
    ],
    notions: [
      ...sapNotions(SAP, 7, 1, [
        { key: 'cloture', label: 'Clôture de période', mastery: null },
        { key: 'regul', label: 'Écritures de régularisation', mastery: null },
      ]),
      ...sapNotions(SAP, 7, 2, [
        { key: 'report', label: 'Report de solde', mastery: null },
        { key: 'bilan', label: 'Bilan et compte de résultat', mastery: null },
      ]),
      ...sapNotions(SAP, 7, 3, [
        { key: 'reeval', label: 'Réévaluation des devises', mastery: null },
      ]),
    ],
  },
];

export interface DemoNotionLinkFixture {
  from: string;
  to: string;
  kind: 'prerequisite' | 'confusion' | 'tutor';
  /** Lien personnel d'Alex (confusion détectée, repérage du tuteur) ; sinon lien du programme. */
  personal: boolean;
  rationale: string;
  source: DemoSource;
}

const LINK_SOURCE: DemoSource = {
  screen: 'SCR-14',
  file: 'Carte.dc.html',
  element: 'const L (liens p = prépare, c = se confondent, t = repéré par le tuteur)',
};

const LINK_ROWS: readonly (readonly [string, string, 'p' | 'c' | 't'])[] = [
  ['s4', 'fiori', 'p'],
  ['fiori', 'launchpad', 'p'],
  ['launchpad', 'appli', 'p'],
  ['role', 'appli', 'p'],
  ['bp', 'donnees', 'p'],
  ['s4', 'acdoca', 'p'],
  ['societe', 'pc', 'p'],
  ['societe', 'devise', 'p'],
  ['societe', 'variante', 'p'],
  ['societe', 'division', 'p'],
  ['perimetre', 'cdp', 'p'],
  ['cdp', 'segment', 'p'],
  ['ledger', 'ledgers', 'p'],
  ['pc', 'compte', 'p'],
  ['piece', 'entete', 'p'],
  ['piece', 'poste', 'p'],
  ['poste', 'cle', 'p'],
  ['entete', 'type', 'p'],
  ['entete', 'dates', 'p'],
  ['variante', 'dates', 'p'],
  ['partie', 'equilibre', 'p'],
  ['poste', 'equilibre', 'p'],
  ['compte', 'poste', 'p'],
  ['piece', 'acdoca', 'p'],
  ['acdoca', 'ledgers', 'p'],
  ['bp', 'fourn', 'p'],
  ['bp', 'client', 'p'],
  ['donnees', 'fourn', 'p'],
  ['donnees', 'client', 'p'],
  ['compte', 'collectif', 'p'],
  ['collectif', 'fourn', 'p'],
  ['collectif', 'client', 'p'],
  ['cle', 'factf', 'p'],
  ['type', 'factf', 'p'],
  ['factf', 'paiement', 'p'],
  ['paiement', 'progpaie', 'p'],
  ['paiement', 'compensation', 'p'],
  ['cle', 'factc', 'p'],
  ['type', 'factc', 'p'],
  ['factc', 'encaissement', 'p'],
  ['encaissement', 'compensation', 'p'],
  ['factc', 'relance', 'p'],
  ['client', 'credit', 'p'],
  ['classe', 'immo', 'p'],
  ['immo', 'amort', 'p'],
  ['domaine', 'amort', 'p'],
  ['immo', 'rebut', 'p'],
  ['variante', 'cloture', 'p'],
  ['cloture', 'regul', 'p'],
  ['cloture', 'report', 'p'],
  ['report', 'bilan', 'p'],
  ['regul', 'bilan', 'p'],
  ['devise', 'reeval', 'p'],
  ['acdoca', 'bilan', 'p'],
  ['cle', 'type', 'c'],
  ['dates', 'cloture', 't'],
  ['ledgers', 'domaine', 't'],
  ['equilibre', 'compensation', 't'],
  ['segment', 'bilan', 't'],
];

export const DEMO_NOTION_LINKS: readonly DemoNotionLinkFixture[] = LINK_ROWS.map(
  ([from, to, kind]) => ({
    from,
    to,
    kind: kind === 'p' ? 'prerequisite' : kind === 'c' ? 'confusion' : 'tutor',
    personal: kind !== 'p',
    rationale:
      kind === 'c'
        ? 'Confusion relevée en quiz le 10 novembre.'
        : kind === 't'
          ? 'Lien repéré par le tuteur pendant la révision.'
          : 'Prérequis du programme SAP.',
    source: LINK_SOURCE,
  }),
);

interface CompactModule {
  title: string;
  chapters: readonly string[];
  notionsPerChapter: number;
  short?: string;
  start: string;
  end: string;
}

function compactModules(
  formation: DemoFormationKey,
  entries: readonly CompactModule[],
): DemoModuleFixture[] {
  return entries.map((entry, moduleIndex) => {
    const position = moduleIndex + 1;
    const chapters = entry.chapters.map((title, chapterIndex) => ({
      key: chapterKey(formation, position, chapterIndex + 1),
      title,
    }));
    const notions: DemoNotionFixture[] = [];
    for (const [chapterIndex, chapter] of chapters.entries()) {
      for (let index = 1; index <= entry.notionsPerChapter; index += 1) {
        const label = `${chapter.title} · notion ${String(index)}`;
        notions.push({
          key: notionKey(formation, position, chapterIndex + 1, index),
          slug: `${formation}:m${String(position)}:c${String(chapterIndex + 1)}:n${String(index)}`,
          label,
          definition: `Notion de fonctionnement « ${label} » pour les écrans de démonstration.`,
          chapterKey: chapter.key,
          mastery: null,
        });
      }
    }
    return {
      key: moduleKey(formation, position),
      position,
      title: entry.title,
      short: entry.short ?? entry.title,
      plannedStart: entry.start,
      plannedEnd: entry.end,
      chapters,
      notions,
    };
  });
}

const AGILE = 'agile';
const PYTHON = 'python';
const EXCEL = 'excel';
const ENGLISH = 'english';

const AGILE_MODULES = compactModules(AGILE, [
  {
    title: 'Cadrage et besoins',
    short: 'Cadrage',
    chapters: ['Utilisateurs et besoins', 'Definition of Done'],
    notionsPerChapter: 2,
    start: '2026-10-26',
    end: '2026-10-29',
  },
  {
    title: 'Planification',
    short: 'Planification',
    chapters: ['Backlog', 'Estimations'],
    notionsPerChapter: 2,
    start: '2026-10-30',
    end: '2026-11-03',
  },
  {
    title: 'Exécution',
    short: 'Exécution',
    chapters: ['Sprints', 'Daily meeting'],
    notionsPerChapter: 2,
    start: '2026-11-04',
    end: '2026-11-06',
  },
  {
    title: 'Qualité',
    short: 'Qualité',
    chapters: ['Tests', 'Revue de code'],
    notionsPerChapter: 2,
    start: '2026-11-09',
    end: '2026-11-11',
  },
  {
    title: 'Rétrospectives',
    short: 'Rétrospectives',
    chapters: ['Format de la rétro', 'Actions'],
    notionsPerChapter: 2,
    start: '2026-11-12',
    end: '2026-11-20',
  },
  {
    title: 'Amélioration continue',
    short: 'Amélioration',
    chapters: ['Indicateurs', 'Boucle d’apprentissage'],
    notionsPerChapter: 2,
    start: '2026-11-23',
    end: '2026-11-27',
  },
]);

const PYTHON_MODULES = compactModules(
  PYTHON,
  [
    ['Fondamentaux Python', '2027-01-08'],
    ['Structures de données', '2027-01-13'],
    ['Pandas', '2027-01-18'],
    ['Nettoyage des données', '2027-01-23'],
    ['Visualisation', '2027-01-28'],
    ['Statistiques', '2027-02-02'],
    ['Automatisation', '2027-02-08'],
    ['Projet final', '2027-02-15'],
  ].map(([title, start], index) => ({
    title: title ?? '',
    chapters: [`${title ?? ''} · chapitre`],
    notionsPerChapter: 2,
    start: start ?? '2027-01-08',
    end: index === 7 ? '2027-02-19' : (start ?? '2027-01-08'),
  })),
);

const EXCEL_MODULES = compactModules(
  EXCEL,
  [
    ['Tableaux et formules', '2026-08-24', '2026-08-28'],
    ['Tableaux croisés dynamiques', '2026-08-31', '2026-09-04'],
    ['Power Query', '2026-09-07', '2026-09-11'],
    ['Macros et automatisation', '2026-09-14', '2026-09-18'],
  ].map(([title, start, end]) => ({
    title: title ?? '',
    chapters: [`${title ?? ''} · chapitre`],
    notionsPerChapter: 2,
    start: start ?? '2026-08-24',
    end: end ?? '2026-09-18',
  })),
);

const ENGLISH_MODULES = compactModules(
  ENGLISH,
  [
    ['Meeting basics', '2026-05-08'],
    ['Presenting results', '2026-05-15'],
    ['Negotiating', '2026-05-22'],
    ['Emails and follow-ups', '2026-05-29'],
    ['Conference calls', '2026-06-05'],
    ['Small talk', '2026-06-12'],
    ['Interview practice', '2026-06-19'],
    ['Final review', '2026-06-26'],
  ].map(([title, start]) => ({
    title: title ?? '',
    chapters: [`${title ?? ''} · chapitre`],
    notionsPerChapter: 1,
    start: start ?? '2026-05-08',
    end: start ?? '2026-05-08',
  })),
);

export const DEMO_FORMATIONS: readonly DemoFormationFixture[] = [
  {
    key: 'sap',
    title: 'SAP S/4HANA Finance',
    monogram: 'SAP',
    accentColor: 'indigo',
    description:
      'Devenir opérationnel sur les processus financiers de SAP S/4HANA et préparer la certification.',
    objectives: ['operational', 'exam'],
    status: 'active',
    volumeHours: 150,
    startDate: '2026-11-02',
    endDate: '2026-12-11',
    defaultThreshold: 80,
    currentModulePosition: 3,
    progressPercent: 38,
    nextActivity: 'Quiz à repasser',
    nextActivityAt: '2026-11-11T14:00:00+01:00',
    maintenanceMode: null,
    resultPercent: null,
    retentionPercent: 86,
    dueNotionCount: 14,
    group: false,
    source: {
      screen: 'SCR-03',
      file: 'Main.dc.html',
      element:
        'carte SAP : 38 %, module 3 sur 7, quiz à repasser aujourd’hui 14:00, fin 11 déc. 2026',
    },
    modules: SAP_MODULES,
  },
  {
    key: 'agile',
    title: 'Gestion de projet agile',
    monogram: 'AG',
    accentColor: 'green',
    description: 'Dialoguer avec des experts et piloter des rétrospectives utiles au collectif.',
    objectives: ['dialogue'],
    status: 'active',
    volumeHours: 72,
    startDate: '2026-10-26',
    endDate: '2026-11-27',
    defaultThreshold: 80,
    currentModulePosition: 5,
    progressPercent: 83,
    nextActivity: 'Apports, chapitre 2',
    nextActivityAt: '2026-11-12T17:30:00+01:00',
    maintenanceMode: null,
    resultPercent: null,
    retentionPercent: null,
    dueNotionCount: 0,
    group: true,
    source: {
      screen: 'SCR-03',
      file: 'Main.dc.html',
      element: 'carte Agile : 83 %, module 5 sur 6, apports demain 17:30, fin 27 nov. 2026',
    },
    modules: AGILE_MODULES,
  },
  {
    key: 'python',
    title: "Python pour l'analyse de données",
    monogram: 'PY',
    accentColor: 'orange',
    description: 'Livrer un projet d’analyse de données avec Python et Pandas.',
    objectives: ['project'],
    status: 'programme_proposed',
    volumeHours: 80,
    startDate: '2027-01-08',
    endDate: '2027-02-19',
    defaultThreshold: 80,
    currentModulePosition: null,
    progressPercent: 0,
    nextActivity: 'Valider le programme',
    nextActivityAt: null,
    maintenanceMode: null,
    resultPercent: null,
    retentionPercent: null,
    dueNotionCount: 0,
    group: false,
    source: {
      screen: 'SCR-03',
      file: 'Main.dc.html',
      element: 'carte Python : 0 %, programme à valider, 8 modules proposés, fin 19 févr. 2027',
    },
    modules: PYTHON_MODULES,
  },
  {
    key: 'excel',
    title: "Excel pour l'analyse financière",
    monogram: 'XL',
    accentColor: 'teal',
    description: 'Automatiser ses tableaux de bord financiers.',
    objectives: ['operational'],
    status: 'completed',
    volumeHours: 60,
    startDate: '2026-08-24',
    endDate: '2026-09-18',
    defaultThreshold: 80,
    currentModulePosition: null,
    progressPercent: 100,
    nextActivity: 'Réviser',
    nextActivityAt: null,
    maintenanceMode: 'light',
    resultPercent: 88,
    retentionPercent: 84,
    dueNotionCount: 5,
    group: false,
    source: {
      screen: 'SCR-03',
      file: 'Main.dc.html',
      element: 'Excel validée 88 %, 84 % retenu, 5 notions aujourd’hui, terminée 18 sept. 2026',
    },
    modules: EXCEL_MODULES,
  },
  {
    key: 'english',
    title: 'Anglais professionnel B2',
    monogram: 'EN',
    accentColor: 'violet',
    description: 'Mener une réunion en anglais.',
    objectives: ['dialogue'],
    status: 'completed',
    volumeHours: 80,
    startDate: '2026-05-08',
    endDate: '2026-07-02',
    defaultThreshold: 80,
    currentModulePosition: null,
    progressPercent: 100,
    nextActivity: 'Réviser',
    nextActivityAt: null,
    maintenanceMode: 'stopped',
    resultPercent: 82,
    retentionPercent: 77,
    dueNotionCount: 0,
    group: false,
    source: {
      screen: 'SCR-03',
      file: 'Main.dc.html',
      element: 'Anglais validée 82 %, 77 %, entretien arrêté, terminée 2 juil. 2026',
    },
    modules: ENGLISH_MODULES,
  },
] as const;

export function demoFormationId(key: DemoFormationKey): string {
  return demoId('formation', key);
}

export function demoModuleId(formation: DemoFormationKey, position: number): string {
  return demoId('module', formation, String(position));
}

export function demoChapterId(
  formation: DemoFormationKey,
  modulePosition: number,
  chapterIndex: number,
): string {
  return demoId('chapter', formation, String(modulePosition), String(chapterIndex));
}

export function demoNotionId(notionKeyValue: string): string {
  return demoId('notion', notionKeyValue);
}

export const SAP_FORMATION = DEMO_FORMATIONS[0] as DemoFormationFixture;
export const AGILE_FORMATION = DEMO_FORMATIONS[1] as DemoFormationFixture;
export const SAP_MODULE_COUNT = SAP_FORMATION.modules.length;
export const SAP_NOTION_COUNT = SAP_FORMATION.modules.reduce(
  (total, module) => total + module.notions.length,
  0,
);
export const SAP_CHAPTER_COUNT = SAP_FORMATION.modules.reduce(
  (total, module) => total + module.chapters.length,
  0,
);

/** Fixed identifiers reused by the SDD page without importing the transactional seed. */
export const DEMO_GROUP_ID = demoId('group', 'agile');
export const DEMO_SAP = {
  formationId: demoFormationId('sap'),
  moduleCount: SAP_MODULE_COUNT,
  chapterCount: SAP_CHAPTER_COUNT,
  notionCount: SAP_NOTION_COUNT,
} as const;

export interface DemoAgendaSlotFixture {
  key: string;
  /** Jour local, 0 = lundi 9 novembre 2026. */
  day: 0 | 1 | 2 | 3 | 4;
  start: string;
  end: string;
  kind: DemoSlotKind;
  title: string;
  meta: string;
  status: 'done' | 'planned';
  formation: 'sap' | 'agile';
  modulePosition: number | null;
  createdBy: 'planner' | 'automation' | 'learner';
  source: DemoSource;
}

const AGENDA_SOURCE: DemoSource = {
  screen: 'SCR-12',
  file: 'Agenda.dc.html',
  element: 'const week2 (semaine du 9 au 13 novembre 2026)',
};

/** Les 21 créneaux rédigés de la semaine du 9 au 13 novembre (heures locales Paris). */
export const DEMO_AGENDA: readonly DemoAgendaSlotFixture[] = [
  [
    'l1',
    0,
    '09:00',
    '12:00',
    'contributions',
    'Apports · Plan comptable',
    'Chapitre 1 · fait',
    'done',
    'sap',
    3,
    'planner',
  ],
  [
    'l2',
    0,
    '14:00',
    '16:00',
    'contributions',
    'Apports · Saisie des pièces',
    'Chapitre 2 · fait',
    'done',
    'sap',
    3,
    'planner',
  ],
  [
    'l3',
    0,
    '17:00',
    '17:30',
    'global_quiz',
    'Quiz global',
    '12 notions · fait',
    'done',
    'sap',
    3,
    'planner',
  ],
  [
    'm1',
    1,
    '09:00',
    '11:00',
    'contributions',
    'Apports · Journal universel',
    'Chapitre 3 · fait',
    'done',
    'sap',
    3,
    'planner',
  ],
  [
    'm2',
    1,
    '11:00',
    '12:00',
    'contributions',
    'Apports · Ledgers',
    'Chapitre 4 · fait',
    'done',
    'sap',
    3,
    'planner',
  ],
  [
    'm3',
    1,
    '14:00',
    '16:00',
    'course',
    'Lecture du cours',
    'Module 3 complet · fait',
    'done',
    'sap',
    3,
    'planner',
  ],
  [
    'm4',
    1,
    '16:30',
    '17:00',
    'validation_quiz',
    'Quiz · tentative 1',
    '58 %',
    'done',
    'sap',
    3,
    'planner',
  ],
  [
    'm5',
    1,
    '17:00',
    '17:30',
    'global_quiz',
    'Quiz global',
    '9 notions · fait',
    'done',
    'sap',
    3,
    'planner',
  ],
  [
    'w1',
    2,
    '09:00',
    '12:00',
    'course',
    'Relecture ciblée',
    'Chapitre 2 et lacunes · fait',
    'done',
    'sap',
    3,
    'planner',
  ],
  [
    'w2w',
    2,
    '13:50',
    '13:52',
    'warmup',
    'Échauffement',
    '3 questions de rappel · 2 min · ajouté par le tuteur',
    'planned',
    'sap',
    3,
    'automation',
  ],
  [
    'w2',
    2,
    '14:00',
    '15:00',
    'validation_quiz',
    'Quiz de validation',
    'Tentative 2 · seuil 80 %',
    'planned',
    'sap',
    3,
    'planner',
  ],
  [
    'w3',
    2,
    '15:00',
    '16:00',
    'buffer',
    'Marge de remédiation',
    'Utilisée si le quiz échoue',
    'planned',
    'sap',
    3,
    'automation',
  ],
  [
    'w4',
    2,
    '17:00',
    '17:30',
    'global_quiz',
    'Quiz global',
    '14 notions · 10 min',
    'planned',
    'sap',
    3,
    'planner',
  ],
  [
    'j1',
    3,
    '09:00',
    '10:30',
    'exercise',
    'Exercice pratique',
    'Saisir une pièce équilibrée',
    'planned',
    'sap',
    3,
    'planner',
  ],
  [
    'j2',
    3,
    '10:30',
    '12:00',
    'course',
    'Ledgers parallèles',
    'Nouvelle explication',
    'planned',
    'sap',
    3,
    'automation',
  ],
  [
    'j3',
    3,
    '14:00',
    '16:00',
    'buffer',
    'Marge de rattrapage',
    'Réservée par le tuteur',
    'planned',
    'sap',
    3,
    'automation',
  ],
  [
    'j4',
    3,
    '17:00',
    '17:30',
    'global_quiz',
    'Quiz global',
    'Notions dues',
    'planned',
    'sap',
    3,
    'planner',
  ],
  [
    'v1',
    4,
    '09:00',
    '11:00',
    'revision',
    'Révision du module',
    'Fiches « À retenir »',
    'planned',
    'sap',
    3,
    'planner',
  ],
  [
    'v2',
    4,
    '11:00',
    '12:00',
    'exercise',
    'Cas complet de saisie',
    'Exercice pratique',
    'planned',
    'sap',
    3,
    'planner',
  ],
  [
    'v3',
    4,
    '14:00',
    '16:00',
    'buffer',
    'Marge de rattrapage',
    'Libérée si tout est validé',
    'planned',
    'sap',
    3,
    'automation',
  ],
  [
    'v4',
    4,
    '17:00',
    '17:30',
    'global_quiz',
    'Quiz global',
    'Notions dues',
    'planned',
    'sap',
    3,
    'planner',
  ],
  [
    'a1',
    1,
    '17:30',
    '18:00',
    'contributions',
    'Agile · apports',
    'Rétrospectives, chapitre 1 · fait',
    'done',
    'agile',
    5,
    'planner',
  ],
  [
    'a2',
    3,
    '17:30',
    '18:00',
    'contributions',
    'Agile · apports',
    'Rétrospectives, chapitre 2',
    'planned',
    'agile',
    5,
    'planner',
  ],
].map(
  ([key, day, start, end, kind, title, meta, status, formation, modulePosition, createdBy]) => ({
    key: key as string,
    day: day as DemoAgendaSlotFixture['day'],
    start: start as string,
    end: end as string,
    kind: kind as DemoSlotKind,
    title: title as string,
    meta: meta as string,
    status: status as 'done' | 'planned',
    formation: formation as 'sap' | 'agile',
    modulePosition: modulePosition as number | null,
    createdBy: createdBy as DemoAgendaSlotFixture['createdBy'],
    source: AGENDA_SOURCE,
  }),
);

export const DEMO_AGENDA_DAYS = [
  { date: '2026-11-09', label: 'lundi 9 novembre' },
  { date: '2026-11-10', label: 'mardi 10 novembre' },
  { date: '2026-11-11', label: 'mercredi 11 novembre' },
  { date: '2026-11-12', label: 'jeudi 12 novembre' },
  { date: '2026-11-13', label: 'vendredi 13 novembre' },
] as const;

/** Convertit une heure locale Paris d'hiver (UTC+1) en instant UTC. */
export function parisInstant(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new Error(`Heure locale invalide : ${date} ${time}`);
  }
  return new Date(`${date}T${time}:00+01:00`).toISOString();
}

export interface DemoNotificationFixture {
  key: string;
  type:
    | 'validation_soon'
    | 'course_ready'
    | 'session_to_reschedule'
    | 'global_quiz_today'
    | 'new_gap'
    | 'session_planned'
    | 'module_validated'
    | 'weekly_review';
  title: string;
  body: string;
  href: string;
  icon: string;
  formation: DemoFormationKey | null;
  createdAt: string;
  read: boolean;
  source: DemoSource;
}

const NOTIFICATION_SOURCE: DemoSource = {
  screen: 'SCR-03',
  file: 'Main.dc.html',
  element: 'panneau Notifications (8 éléments, 3 non lues)',
};

export const DEMO_NOTIFICATIONS: readonly DemoNotificationFixture[] = [
  {
    key: 'validation-1400',
    type: 'validation_soon',
    title: 'Quiz de validation à 14:00',
    body: 'Module 3 · Comptabilité générale, tentative 2. Seuil de validation : 80 %.',
    href: '/formations/sap/modules/3/quiz',
    icon: 'validation',
    formation: 'sap',
    createdAt: parisInstant('2026-11-11', '13:20'),
    read: false,
    source: NOTIFICATION_SOURCE,
  },
  {
    key: 'course-ready',
    type: 'course_ready',
    title: 'Votre cours est prêt',
    body: 'Chapitre 2 · Saisie des pièces comptables, rédigé à partir de vos 4 apports.',
    href: '/formations/sap/modules/3/cours',
    icon: 'course',
    formation: 'sap',
    createdAt: parisInstant('2026-11-11', '11:05'),
    read: false,
    source: NOTIFICATION_SOURCE,
  },
  {
    key: 'reschedule-ledgers',
    type: 'session_to_reschedule',
    title: 'Une séance à replacer',
    body: '« Ledgers parallèles » non terminé mardi : reprise proposée jeudi 10:30. Votre accord est demandé.',
    href: '/agenda?vue=semaine&date=2026-11-12',
    icon: 'calendar',
    formation: 'sap',
    createdAt: parisInstant('2026-11-11', '08:05'),
    read: false,
    source: NOTIFICATION_SOURCE,
  },
  {
    key: 'global-quiz-today',
    type: 'global_quiz_today',
    title: 'Quiz global du jour',
    body: '14 notions à revoir, lacunes en priorité. Prévu à 17:00, environ 10 min.',
    href: '/formations/sap/quiz-global',
    icon: 'quiz',
    formation: 'sap',
    createdAt: parisInstant('2026-11-11', '08:00'),
    read: true,
    source: NOTIFICATION_SOURCE,
  },
  {
    key: 'new-gap-cle',
    type: 'new_gap',
    title: 'Nouvelle lacune repérée',
    body: 'Clé de comptabilisation : confondue avec le type de pièce, deux fois.',
    href: '/formations/sap/lacunes',
    icon: 'gap',
    formation: 'sap',
    createdAt: parisInstant('2026-11-10', '16:42'),
    read: true,
    source: NOTIFICATION_SOURCE,
  },
  {
    key: 'session-agile',
    type: 'session_planned',
    title: 'Session demain à 17:30',
    body: 'Rétrospectives · apports du chapitre 2. Pensez à préparer vos notes.',
    href: '/agenda?vue=semaine&date=2026-11-12',
    icon: 'session',
    formation: 'agile',
    createdAt: parisInstant('2026-11-10', '18:00'),
    read: true,
    source: NOTIFICATION_SOURCE,
  },
  {
    key: 'module-2-validated',
    type: 'module_validated',
    title: 'Module 2 validé · 91 %',
    body: 'Le module 3 · Comptabilité générale est débloqué.',
    href: '/formations/sap/programme',
    icon: 'check',
    formation: 'sap',
    createdAt: parisInstant('2026-11-09', '09:10'),
    read: true,
    source: NOTIFICATION_SOURCE,
  },
  {
    key: 'weekly-review',
    type: 'weekly_review',
    title: 'Bilan de la semaine',
    body: "13 h d'étude, 86 % retenu à 1 mois, 3 notions à risque d'oubli.",
    href: '/accueil#bilan',
    icon: 'review',
    formation: 'sap',
    createdAt: parisInstant('2026-11-08', '19:00'),
    read: true,
    source: NOTIFICATION_SOURCE,
  },
] as const;

export interface DemoAutomationActionFixture {
  key: string;
  automation:
    | 'reprise'
    | 'micro_seance'
    | 'echauffement'
    | 'remediation'
    | 'jeu_lacune'
    | 'questions_cartes'
    | 'plafond_quiz'
    | 'sprint'
    | 'bilan'
    | 'pause';
  kind: string;
  summary: string;
  status: 'pending_consent' | 'applied' | 'declined' | 'undone' | 'expired' | 'consumed';
  requiresConsent: boolean;
  formation: DemoFormationKey | null;
  createdAt: string;
  /** SPEC-712 — payload of the action (missed slot, proposal and alternatives). */
  payload?: Record<string, unknown>;
  source: DemoSource;
}

const AUTOMATION_SOURCE: DemoSource = {
  screen: 'SCR-15',
  file: 'Parametres.dc.html',
  element: 'Journal de la semaine et « Le tuteur a agi pour vous »',
};

export const DEMO_AUTOMATION_ACTIONS: readonly DemoAutomationActionFixture[] = [
  {
    key: 'reschedule',
    automation: 'reprise',
    kind: 'reprise_proposed',
    summary:
      '« Ledgers parallèles » n’a pas été terminé mardi. Je propose de le reprendre jeudi à 10:30, dans une marge de votre agenda.',
    status: 'pending_consent',
    requiresConsent: true,
    formation: 'sap',
    createdAt: parisInstant('2026-11-11', '08:05'),
    payload: {
      dedupeKey: 'missed:demo-m0',
      createdOn: parisInstant('2026-11-11', '08:05'),
      missedSlotId: demoId('slot', 'm0'),
      title: 'Ledgers parallèles',
      missedDate: '2026-11-10',
      proposed: {
        startsAt: parisInstant('2026-11-12', '10:30'),
        endsAt: parisInstant('2026-11-12', '12:00'),
        bufferSlotId: demoId('slot', 'm0-buffer'),
        inBuffer: true,
      },
      alternatives: [
        {
          startsAt: parisInstant('2026-11-12', '15:00'),
          endsAt: parisInstant('2026-11-12', '16:00'),
        },
        {
          startsAt: parisInstant('2026-11-13', '15:00'),
          endsAt: parisInstant('2026-11-13', '16:00'),
        },
        {
          startsAt: parisInstant('2026-11-16', '09:00'),
          endsAt: parisInstant('2026-11-16', '10:00'),
        },
      ],
    },
    source: AUTOMATION_SOURCE,
  },
  {
    key: 'schedule-remains',
    automation: 'remediation',
    kind: 'remediation_ready',
    summary: 'Marge de remédiation réservée mercredi de 15:00 à 16:00.',
    status: 'applied',
    requiresConsent: false,
    formation: 'sap',
    createdAt: parisInstant('2026-11-11', '07:00'),
    source: AUTOMATION_SOURCE,
  },
  {
    key: 'warmup',
    automation: 'echauffement',
    kind: 'warmup_added',
    summary:
      'Échauffement ajouté avant votre quiz de 14:00 : 3 questions sur Clé de comptabilisation, Date comptable, Plan comptable.',
    status: 'applied',
    requiresConsent: false,
    formation: 'sap',
    createdAt: parisInstant('2026-11-11', '07:05'),
    payload: {
      dedupeKey: `warmup:2026-11-11:${demoFormationId('sap')}`,
      date: '2026-11-11',
      activityId: demoId('activity', 'warmup'),
      slotId: demoId('slot', 'w2w'),
      formationId: demoFormationId('sap'),
      formationTitle: 'SAP S/4HANA Finance',
      count: 3,
      scope: 'yesterday_prerequisites',
      notionIds: [
        demoNotionId('sap:m3:c2:n4'),
        demoNotionId('sap:m3:c2:n6'),
        demoNotionId('sap:m2:c1:n2'),
      ],
      notionLabels: ['Clé de comptabilisation', 'Date comptable', 'Plan comptable'],
      reviewNotionIds: [],
      nextSession: {
        slotId: demoId('slot', 'w2'),
        kind: 'validation_quiz',
        startsAt: parisInstant('2026-11-11', '14:00'),
        moduleId: demoModuleId('sap', 3),
        activityId: demoId('activity', 'm3-quiz'),
      },
    },
    source: AUTOMATION_SOURCE,
  },
  {
    key: 'quiz-cap',
    automation: 'plafond_quiz',
    kind: 'quiz_smoothed',
    summary: '18 notions étaient dues : 4 reportées à jeudi pour rester sous 15 minutes.',
    status: 'applied',
    requiresConsent: false,
    formation: 'sap',
    createdAt: parisInstant('2026-11-11', '08:00'),
    source: AUTOMATION_SOURCE,
  },
  {
    key: 'sprint',
    automation: 'sprint',
    kind: 'sprint_planned',
    summary: 'Sprint avant le quiz ajouté jeudi à 16:30.',
    status: 'applied',
    requiresConsent: false,
    formation: 'sap',
    createdAt: parisInstant('2026-11-10', '19:00'),
    source: AUTOMATION_SOURCE,
  },
  {
    key: 'games',
    automation: 'jeu_lacune',
    kind: 'game_chosen',
    summary: 'Cinq jeux choisis pour le quiz global, lacunes en priorité.',
    status: 'applied',
    requiresConsent: false,
    formation: 'sap',
    createdAt: parisInstant('2026-11-11', '08:01'),
    source: AUTOMATION_SOURCE,
  },
  {
    key: 'weekly-review',
    automation: 'bilan',
    kind: 'weekly_review',
    summary: 'Bilan de la semaine envoyé dimanche à 19:00.',
    status: 'applied',
    requiresConsent: false,
    formation: 'sap',
    createdAt: parisInstant('2026-11-08', '19:00'),
    source: AUTOMATION_SOURCE,
  },
] as const;

/** 12 jours consécutifs du 31 octobre au 11 novembre 2026 (série de 12). */
export const DEMO_DAILY_ACTIVITY = [
  { day: '2026-10-31', minutes: 60 },
  { day: '2026-11-01', minutes: 45 },
  { day: '2026-11-02', minutes: 120 },
  { day: '2026-11-03', minutes: 115 },
  { day: '2026-11-04', minutes: 110 },
  { day: '2026-11-05', minutes: 105 },
  { day: '2026-11-06', minutes: 100 },
  { day: '2026-11-07', minutes: 90 },
  { day: '2026-11-08', minutes: 140 },
  { day: '2026-11-09', minutes: 115 },
  { day: '2026-11-10', minutes: 110 },
  { day: '2026-11-11', minutes: 150 },
] as const;

export const DEMO_EXPECTED = {
  users: DEMO_USERS.length,
  activeOrProposed: DEMO_FORMATIONS.filter(
    (formation) => formation.status === 'active' || formation.status === 'programme_proposed',
  ).length,
  completed: DEMO_FORMATIONS.filter((formation) => formation.status === 'completed').length,
  sapModules: SAP_MODULE_COUNT,
  sapChapters: SAP_CHAPTER_COUNT,
  sapNotions: SAP_NOTION_COUNT,
  groupMembers: 3,
  agendaSlots: DEMO_AGENDA.length,
  agendaDays: DEMO_AGENDA_DAYS.length,
  notifications: DEMO_NOTIFICATIONS.length,
  unreadNotifications: DEMO_NOTIFICATIONS.filter((notification) => !notification.read).length,
  dueNotions: 18,
  reviewNotions: 14,
  gaps: 4,
} as const;

export function allDemoSources(): Array<{ label: string; source: DemoSource }> {
  const entries: Array<{ label: string; source: DemoSource }> = [
    { label: 'profile', source: DEMO_PROFILE.source },
    { label: 'preferences', source: DEMO_PREFERENCES.source },
    { label: 'notification-settings', source: DEMO_NOTIFICATION_SETTINGS.source },
  ];
  for (const user of DEMO_USERS) entries.push({ label: `user.${user.key}`, source: user.source });
  for (const formation of DEMO_FORMATIONS) {
    entries.push({ label: `formation.${formation.key}`, source: formation.source });
  }
  for (const notification of DEMO_NOTIFICATIONS) {
    entries.push({ label: `notification.${notification.key}`, source: notification.source });
  }
  for (const action of DEMO_AUTOMATION_ACTIONS) {
    entries.push({ label: `automation.${action.key}`, source: action.source });
  }
  for (const slot of DEMO_AGENDA) {
    entries.push({ label: `agenda.${slot.key}`, source: slot.source });
  }
  return entries;
}

/** Empreinte stable de la fixture : elle ne dépend ni de l'heure réelle ni de la base. */
export function demoFixtureFingerprint(): string {
  const payload = JSON.stringify({
    now: DEMO_NOW_ISO,
    users: DEMO_USERS,
    profile: DEMO_PROFILE,
    preferences: DEMO_PREFERENCES,
    notificationSettings: DEMO_NOTIFICATION_SETTINGS,
    automations: DEMO_AUTOMATIONS,
    formations: DEMO_FORMATIONS,
    notionLinks: DEMO_NOTION_LINKS,
    agenda: DEMO_AGENDA,
    notifications: DEMO_NOTIFICATIONS,
    automationActions: DEMO_AUTOMATION_ACTIONS,
    dailyActivity: DEMO_DAILY_ACTIVITY,
    expected: DEMO_EXPECTED,
  });
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}
