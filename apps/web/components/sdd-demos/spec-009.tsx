import {
  ACCOUNT_RULES,
  AI_TASKS,
  DEFAULT_MODEL_BY_TASK,
  FORMATION_RULES,
  GROUP_RULES,
  MEMORY_RULES,
  NOTIFICATION_RULES,
  PUBLIC_ENV_KEYS,
  QUIZ_RULES,
  RESOURCE_RULES,
  THINKING_EFFORT_BY_TASK,
} from '@learny/config';

import {
  DEMO_INVALID_PRODUCTION_ENV,
  DEMO_LOCAL_ENV,
  DEMO_SECRET_KEYS,
} from '../../lib/sdd-config-demo';
import {
  SERVER_VARIABLE_COUNT,
  configurationErrorNames,
  getPublicEnv,
  getServerEnv,
  secretPresence,
} from '../../lib/server-env';
import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

const t = fr.sdd.spec009;

const cell = 'py-2 pr-4 align-top';
const region = 'overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2';

const MODES = [
  { id: 'llm', label: t.modes.llm, key: 'LLM_MODE' },
  { id: 'stripe', label: t.modes.stripe, key: 'STRIPE_MODE' },
  { id: 'email', label: t.modes.email, key: 'EMAIL_MODE' },
  { id: 'push', label: t.modes.push, key: 'PUSH_MODE' },
] as const;

const FAMILIES = [
  {
    id: 'ACCOUNT',
    label: t.product.families.ACCOUNT,
    constants: [
      ['magicLinkTtlMinutes', `${String(ACCOUNT_RULES.magicLinkTtlMinutes)} min`],
      ['passwordMinLength', String(ACCOUNT_RULES.passwordMinLength)],
      [
        'studyHoursPerDay',
        `${String(ACCOUNT_RULES.studyHoursPerDay.min)}–${String(ACCOUNT_RULES.studyHoursPerDay.max)} (défaut ${String(ACCOUNT_RULES.studyHoursPerDay.default)})`,
      ],
      ['exportLinkDays', `${String(ACCOUNT_RULES.exportLinkDays)} j`],
      ['accountDeletionDays', `${String(ACCOUNT_RULES.accountDeletionDays)} j`],
    ],
  },
  {
    id: 'RESOURCE',
    label: t.product.families.RESOURCE,
    constants: [
      ['pdfMaxMegabytes', `${String(RESOURCE_RULES.pdfMaxMegabytes)} Mo`],
      ['pdfMaxPages', String(RESOURCE_RULES.pdfMaxPages)],
      ['imageMaxMegabytes', `${String(RESOURCE_RULES.imageMaxMegabytes)} Mo`],
      ['noteMaxCharacters', String(RESOURCE_RULES.noteMaxCharacters)],
      ['resourcesPerChapter', String(RESOURCE_RULES.resourcesPerChapter)],
      ['storageMaxGigabytes', `${String(RESOURCE_RULES.storageMaxGigabytes)} Go`],
    ],
  },
  {
    id: 'QUIZ',
    label: t.product.families.QUIZ,
    constants: [
      [
        'defaultQuestionCount',
        `${String(QUIZ_RULES.defaultQuestionCount)} (${String(QUIZ_RULES.minQuestionCount)}–${String(QUIZ_RULES.maxQuestionCount)})`,
      ],
      ['scoreScale', String(QUIZ_RULES.scoreScale)],
      ['retryDelayHours', `${String(QUIZ_RULES.retryDelayHours)} h`],
      [
        'mockExam',
        `${String(QUIZ_RULES.mockExam.questionCount)} questions, seuil ${String(QUIZ_RULES.mockExam.thresholdPercent)} %`,
      ],
    ],
  },
  {
    id: 'MEMORY',
    label: t.product.families.MEMORY,
    constants: [
      ['retentionTargetPercent', `${String(MEMORY_RULES.retentionTargetPercent)} %`],
      ['dailyReviewMaxMinutes', `${String(MEMORY_RULES.dailyReviewMaxMinutes)} min`],
      ['minVariantsPerNotion', String(MEMORY_RULES.minVariantsPerNotion)],
      ['masteryThresholdPercent', `${String(MEMORY_RULES.masteryThresholdPercent)} %`],
    ],
  },
  {
    id: 'NOTIFICATION',
    label: t.product.families.NOTIFICATION,
    constants: [
      ['dailyExternalCap', String(NOTIFICATION_RULES.dailyExternalCap)],
      ['quietHours', `${NOTIFICATION_RULES.quietHours.start}–${NOTIFICATION_RULES.quietHours.end}`],
      ['dailyProgramHour', NOTIFICATION_RULES.dailyProgramHour],
      [
        'validationQuizReminderMinutes',
        `${String(NOTIFICATION_RULES.validationQuizReminderMinutes)} min`,
      ],
    ],
  },
  {
    id: 'FORMATION',
    label: t.product.families.FORMATION,
    constants: [
      ['maxActiveFormations', String(FORMATION_RULES.maxActiveFormations)],
      ['maxFramingQuestions', String(FORMATION_RULES.maxFramingQuestions)],
      [
        'moduleThresholdPercent',
        `${String(FORMATION_RULES.moduleThresholdPercent.default)} % (${String(FORMATION_RULES.moduleThresholdPercent.min)}–${String(FORMATION_RULES.moduleThresholdPercent.max)})`,
      ],
      [
        'milestones',
        `${String(FORMATION_RULES.milestones.retainedNotions)} notions, ${String(FORMATION_RULES.milestones.streakDays)} j`,
      ],
    ],
  },
  {
    id: 'GROUP',
    label: t.product.families.GROUP,
    constants: [
      ['maxMembers', String(GROUP_RULES.maxMembers)],
      ['invitationCodePattern', GROUP_RULES.invitationCodePattern],
    ],
  },
] as const;

export default function Spec009Demo() {
  const env = getServerEnv();
  const publicEnv = getPublicEnv();
  // Presence only: the simulated values are never rendered (EF-7).
  const simulated = secretPresence(DEMO_LOCAL_ENV, DEMO_SECRET_KEYS);
  const invalidFields = configurationErrorNames(DEMO_INVALID_PRODUCTION_ENV);

  return (
    <>
      <DemoSection testId="spec-009-environment" title={t.environment.title}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4">
          <dt className="font-mono">{t.environment.appEnv}</dt>
          <dd data-testid="spec-009-app-env" className="font-mono">
            {env.APP_ENV}
          </dd>
          <dt>{t.environment.counts}</dt>
          <dd>
            <span className="font-mono">
              {`${t.environment.publicCount} : `}
              <span data-testid="spec-009-public-count">{PUBLIC_ENV_KEYS.length}</span>
              {` · ${t.environment.serverCount} : `}
              <span data-testid="spec-009-server-count">{SERVER_VARIABLE_COUNT}</span>
            </span>
          </dd>
        </dl>

        <h3 className="mt-6 font-semibold">{t.environment.secrets}</h3>
        <p className="mt-1 text-sm">{t.environment.secretsNote}</p>
        <div role="region" aria-label={t.environment.secrets} tabIndex={0} className={region}>
          <table data-testid="spec-009-secrets" className="mt-2 w-full text-left">
            <thead>
              <tr>
                <th scope="col" className={cell}>
                  {t.public.key}
                </th>
                <th scope="col" className={cell}>
                  {t.public.status}
                </th>
              </tr>
            </thead>
            <tbody>
              {DEMO_SECRET_KEYS.map((name) => (
                <tr key={name} data-testid={`spec-009-secret-${name.toLowerCase()}`}>
                  <td className={`${cell} font-mono break-all`}>{name}</td>
                  <td className={cell}>
                    {simulated[name] ? t.environment.configured : t.environment.absent}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="mt-6 font-semibold">{t.environment.invalid}</h3>
        <p className="mt-1 text-sm">{t.environment.invalidIntro}</p>
        <ul data-testid="spec-009-invalid" className="mt-2 break-all font-mono text-sm">
          {invalidFields.map((name) => (
            <li key={name} data-testid="spec-009-invalid-field">
              {name}
            </li>
          ))}
        </ul>
      </DemoSection>

      <DemoSection testId="spec-009-modes" title={t.modes.title}>
        <div role="region" aria-label={t.modes.title} tabIndex={0} className={region}>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th scope="col" className={cell}>
                  {t.public.key}
                </th>
                <th scope="col" className={cell}>
                  {t.public.status}
                </th>
              </tr>
            </thead>
            <tbody>
              {MODES.map((mode) => (
                <tr key={mode.id}>
                  <td className={cell}>{mode.label}</td>
                  <td
                    data-testid={`spec-009-mode-${mode.id}`}
                    className={`${cell} font-mono break-all`}
                  >
                    {env[mode.key]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-sm">{t.modes.note}</p>
      </DemoSection>

      <DemoSection testId="spec-009-public" title={t.public.title}>
        <p className="text-sm">{t.public.note}</p>
        <div role="region" aria-label={t.public.title} tabIndex={0} className={region}>
          <table className="mt-2 w-full text-left">
            <thead>
              <tr>
                <th scope="col" className={cell}>
                  {t.public.key}
                </th>
                <th scope="col" className={cell}>
                  {t.public.status}
                </th>
              </tr>
            </thead>
            <tbody>
              {PUBLIC_ENV_KEYS.map((key) => (
                <tr key={key} data-testid={`spec-009-public-${key.toLowerCase()}`}>
                  <td className={`${cell} font-mono break-all`}>{key}</td>
                  <td className={cell}>
                    {publicEnv[key] === undefined ? t.environment.absent : t.environment.configured}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DemoSection>

      <DemoSection testId="spec-009-models" title={t.models.title}>
        <div role="region" aria-label={t.models.title} tabIndex={0} className={region}>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th scope="col" className={cell}>
                  {t.models.task}
                </th>
                <th scope="col" className={cell}>
                  {t.models.model}
                </th>
                <th scope="col" className={cell}>
                  {t.models.effort}
                </th>
              </tr>
            </thead>
            <tbody>
              {AI_TASKS.map((task) => (
                <tr key={task} data-testid={`spec-009-model-${task}`}>
                  <td className={cell}>{t.models.tasks[task]}</td>
                  <td className={`${cell} font-mono break-all`}>{DEFAULT_MODEL_BY_TASK[task]}</td>
                  <td className={cell}>{t.models.efforts[THINKING_EFFORT_BY_TASK[task]]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DemoSection>

      <DemoSection testId="spec-009-product" title={t.product.title}>
        <p className="text-sm">{t.product.note}</p>
        <ul className="mt-2 grid gap-4 sm:grid-cols-2">
          {FAMILIES.map((family) => (
            <li key={family.id} data-testid="spec-009-family">
              <h3 className="font-semibold">{family.label}</h3>
              <ul className="mt-1 text-sm">
                {family.constants.map(([name, value]) => (
                  <li key={name}>
                    <span className="font-mono">{name}</span> : {value}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </DemoSection>
    </>
  );
}
