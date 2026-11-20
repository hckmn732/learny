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
import { fr } from '@learny/i18n/fr/sdd';

import { serverApi } from '../../lib/api/server-client';
import { DEMO_SECRET_KEYS } from '../../lib/sdd-config-demo';
import { DemoSection } from '../sdd/demo-shell';

const t = fr.sdd.spec009;

const cell = 'py-2 pr-4 align-top';
const region = 'overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2';

const MODES = [
  { id: 'llm', label: t.modes.llm },
  { id: 'stripe', label: t.modes.stripe },
  { id: 'email', label: t.modes.email },
  { id: 'push', label: t.modes.push },
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

export default async function Spec009Demo() {
  const data = (await (await serverApi()).api.devSddSpec009Demo({})) as {
    appEnv: string;
    modes: { llm: string; stripe: string; email: string; push: string };
    publicConfigured: Record<string, boolean>;
    serverCount: number;
    simulated: Record<string, boolean>;
    invalidFields: string[];
  };

  return (
    <>
      <DemoSection testId="spec-009-environment" title={t.environment.title}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4">
          <dt className="font-mono">{t.environment.appEnv}</dt>
          <dd data-testid="spec-009-app-env" className="font-mono">
            {data.appEnv}
          </dd>
          <dt>{t.environment.counts}</dt>
          <dd>
            <span className="font-mono">
              {`${t.environment.publicCount} : `}
              <span data-testid="spec-009-public-count">{PUBLIC_ENV_KEYS.length}</span>
              {` · ${t.environment.serverCount} : `}
              <span data-testid="spec-009-server-count">{data.serverCount}</span>
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
                    {data.simulated[name] ? t.environment.configured : t.environment.absent}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="mt-6 font-semibold">{t.environment.invalid}</h3>
        <p className="mt-1 text-sm">{t.environment.invalidIntro}</p>
        <ul data-testid="spec-009-invalid" className="mt-2 break-all font-mono text-sm">
          {data.invalidFields.map((name) => (
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
                    {data.modes[mode.id]}
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
                    {data.publicConfigured[key] === true
                      ? t.environment.configured
                      : t.environment.absent}
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
