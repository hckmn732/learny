// Sample data of the templates (SPEC-204 ET-8): Alex Perrin on Wednesday 11 November 2026, as shown
// by the mockups (`Main.dc.html`, notifications panel, "Votre journée" and "Bilan de la semaine").
// They feed the preview server, the snapshot tests and the demonstration page.
import type { EmailProps, EmailTemplateKey } from './schemas';
import type { Tone } from './tone';

export const FIXTURE_USER = {
  firstName: 'Alex',
  formationTitle: 'SAP S/4HANA Finance',
} as const;

type FixtureFactory<K extends EmailTemplateKey> = (tone: Tone) => EmailProps<K>;

export const EMAIL_FIXTURES: { [K in EmailTemplateKey]: FixtureFactory<K> } = {
  welcome: () => ({ firstName: FIXTURE_USER.firstName }),
  daily_digest: () => ({
    firstName: FIXTURE_USER.firstName,
    dateLabel: 'mercredi 11 novembre',
    plannedLabel: '5 h',
    activities: [
      {
        time: '09:00',
        title: 'Relecture du cours',
        detail: 'Chapitre 2 · Saisie des pièces comptables',
        formationTitle: FIXTURE_USER.formationTitle,
      },
      {
        time: '13:50',
        title: 'Échauffement',
        detail: '3 questions · 2 min',
        formationTitle: FIXTURE_USER.formationTitle,
      },
      {
        time: '14:00',
        title: 'Quiz de validation, tentative 2',
        detail: 'Module 3 · Comptabilité générale · seuil 80 %',
        formationTitle: FIXTURE_USER.formationTitle,
      },
      {
        time: '17:00',
        title: 'Quiz global',
        detail: '14 notions à revoir · environ 10 min',
        formationTitle: FIXTURE_USER.formationTitle,
      },
    ],
    globalQuiz: { notions: 14, minutes: 10, formationTitle: FIXTURE_USER.formationTitle },
    held: {
      count: 2,
      maxPerDay: 5,
      titles: ['Une séance à replacer', 'Votre cours est prêt'],
    },
  }),
  reminder: (tone) => ({
    title: 'Quiz de validation à 14:00',
    body:
      tone === 'tu'
        ? 'Module 3 · Comptabilité générale, tentative 2. Seuil de validation : 80 %. Compte 20 minutes.'
        : 'Module 3 · Comptabilité générale, tentative 2. Seuil de validation : 80 %. Comptez 20 minutes.',
    href: '/formations/sap-s4hana-finance/modules/3/quiz',
    ctaLabel: 'Commencer le quiz',
    formationTitle: FIXTURE_USER.formationTitle,
  }),
  weekly_review: () => ({
    periodStartLabel: '2 novembre',
    periodEndLabel: '8 novembre',
    studyLabel: '13 h',
    retentionPercent: 86,
    atRiskCount: 3,
    succeeded: 'module 2 validé à 92 %, 41 notions consolidées',
    atRisk: 'écritures d’abonnement, ledgers parallèles, clôture périodique',
    nextWeek: 'module 3 Comptabilité générale, quiz de validation mercredi, 5 séances prévues',
  }),
  ai_task_failed: () => ({
    taskLabel: 'rédaction du cours',
    modelLabel: 'gpt-4.1-mini',
    subject: 'Chapitre 4 · Clôture périodique',
    managedAvailable: true,
  }),
  export_ready: () => ({
    downloadUrl: 'https://learny.example/exports/alex-perrin-2026-11-11.zip?token=exemple',
    sizeLabel: '42 Mo',
    expiresLabel: 'mercredi 18 novembre à 13:20',
  }),
  deletion_scheduled: () => ({ scheduledLabel: 'vendredi 11 décembre 2026' }),
  deletion_completed: () => ({ requestedLabel: '11 novembre 2026' }),
};

export function fixtureFor<K extends EmailTemplateKey>(key: K, tone: Tone): EmailProps<K> {
  return EMAIL_FIXTURES[key](tone);
}
