import { CI_WORKFLOW, PR_TITLE_WORKFLOW } from '../../../../tools/ci/check-workflows.mjs';
import { readCiConfig } from '../../lib/ci-config';
import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

const t = fr.sdd.spec011;

const JOB_ORDER = ['audit', 'quality', 'integration', 'e2e'] as const;

const JOB_LABELS: Record<(typeof JOB_ORDER)[number], string> = {
  audit: t.jobs.audit,
  quality: t.jobs.quality,
  integration: t.jobs.integration,
  e2e: t.jobs.e2e,
};

const MODE_ORDER = [
  'CLOCK_FIXED_AT',
  'LLM_MODE',
  'STRIPE_MODE',
  'EMAIL_MODE',
  'PUSH_MODE',
  'ENABLE_SDD_PAGES',
] as const;

const cell = 'py-2 pr-4 align-top';

export default function Spec011Demo() {
  const ci = readCiConfig();

  if (!ci.available) {
    return (
      <DemoSection testId="spec-011-jobs" title={t.jobs.title}>
        <p>{t.unavailable}</p>
      </DemoSection>
    );
  }

  const security = [
    { key: 'gitleaks', label: t.security.gitleaks, ok: ci.security.gitleaks },
    { key: 'builtin', label: t.security.builtin, ok: ci.security.builtinScanner },
    { key: 'pr-title', label: t.security.prTitle, ok: ci.security.prTitle.commitlint },
    {
      key: 'audit',
      label: `${t.security.audit} · ${t.security.threshold} : ${ci.security.auditLevel ?? '—'}`,
      ok: ci.security.auditLevel !== null,
    },
  ];

  return (
    <>
      <DemoSection testId="spec-011-jobs" title={t.jobs.title}>
        <p>{t.jobs.intro}</p>
        <ol className="mt-3 list-decimal space-y-2 pl-6">
          {JOB_ORDER.map((id) => {
            const job = ci.jobs.find((candidate) => candidate.id === id);
            return (
              <li key={id} data-testid={`spec-011-job-${id}`}>
                <span className="font-semibold">{JOB_LABELS[id]}</span>{' '}
                <span>{job === undefined ? t.jobs.missing : t.jobs.configured}</span>
                <span className="block font-mono text-sm">{job?.name ?? id}</span>
                <span className="block text-sm">
                  {`${t.jobs.condition} : ${job !== undefined && job.condition !== '' ? job.condition : t.jobs.noCondition}`}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-sm">
          {t.source} <code>{CI_WORKFLOW}</code>
        </p>
      </DemoSection>

      <DemoSection testId="spec-011-security" title={t.security.title}>
        <ul className="grid gap-2 sm:grid-cols-2">
          {security.map((item) => (
            <li
              key={item.key}
              data-testid={`spec-011-security-${item.key}`}
              className="flex items-center justify-between gap-4 rounded-[12px] border border-solid border-border px-4 py-2"
            >
              <span>{item.label}</span>
              <span className="text-sm font-medium">
                {item.ok ? t.security.configured : t.security.missing}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm">
          {t.source} <code>{PR_TITLE_WORKFLOW}</code>
        </p>
      </DemoSection>

      <DemoSection testId="spec-011-modes" title={t.modes.title}>
        <div
          // Axe (scrollable-region-focusable) : la zone défilante doit être atteignable au clavier.
          tabIndex={0}
          role="region"
          aria-label={t.modes.title}
          className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <table className="w-full text-left">
            <thead>
              <tr>
                <th scope="col" className={cell}>
                  {t.modes.variable}
                </th>
                <th scope="col" className={cell}>
                  {t.modes.value}
                </th>
              </tr>
            </thead>
            <tbody>
              {MODE_ORDER.map((name) => (
                <tr key={name}>
                  <td className={`${cell} font-mono`}>{name}</td>
                  <td data-testid={`spec-011-mode-${name}`} className={`${cell} font-mono`}>
                    {ci.env[name] ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DemoSection>

      <DemoSection testId="spec-011-artifacts" title={t.artifacts.title}>
        <div
          // Axe (scrollable-region-focusable) : la zone défilante doit être atteignable au clavier.
          tabIndex={0}
          role="region"
          aria-label={t.artifacts.title}
          className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <table className="w-full text-left">
            <thead>
              <tr>
                <th scope="col" className={cell}>
                  {t.artifacts.name}
                </th>
                <th scope="col" className={cell}>
                  {t.artifacts.job}
                </th>
                <th scope="col" className={cell}>
                  {t.artifacts.retention}
                </th>
                <th scope="col" className={cell}>
                  {t.artifacts.always}
                </th>
              </tr>
            </thead>
            <tbody>
              {ci.artifacts.map((artifact) => (
                <tr key={artifact.name} data-testid={`spec-011-artifact-${artifact.name}`}>
                  <td className={`${cell} font-mono`}>{artifact.name}</td>
                  <td className={cell}>{artifact.job}</td>
                  <td className={cell}>{artifact.retentionDays}</td>
                  <td className={cell}>{artifact.always ? t.artifacts.yes : t.artifacts.no}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DemoSection>
    </>
  );
}
