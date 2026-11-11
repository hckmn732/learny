import { HOSTING_REGIONS, isEuRegion, type HostingService } from '@learny/config';

import { runCheck } from '../../../../tools/deploy/check.mjs';
import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

const t = fr.sdd.spec013;

const ENVIRONMENTS = ['local', 'test', 'preview', 'production'] as const;
const COMPONENTS = ['web', 'base', 'jobs', 'ai'] as const;
const REGION_SERVICES = ['vercel', 'supabase', 'inngest'] as const;

const cell = 'py-2 pr-4 align-top';
const region = 'overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2';

// The page never loads .env: it proves the static dry-run works without any credential (EF-8).
const DEMO_ENV = {
  APP_ENV: 'preview',
  ENABLE_SDD_PAGES: 'true',
} as const;

export default function Spec013Demo() {
  const result = runCheck({
    env: DEMO_ENV,
    envName: 'preview',
    dryRun: true,
    ref: 'refs/pull/1/head',
    branch: 'spec/demo',
    event: 'pull_request',
  });
  const report = result.report;

  return (
    <>
      <DemoSection testId="spec-013-environments" title={t.environments.title}>
        <p>{t.environments.intro}</p>
        <div role="region" aria-label={t.environments.title} tabIndex={0} className={region}>
          <table data-testid="spec-013-environments-table" className="mt-3 w-full text-left">
            <thead>
              <tr>
                <th scope="col" className={cell}>
                  {t.environments.component}
                </th>
                {ENVIRONMENTS.map((environment) => (
                  <th key={environment} scope="col" className={cell}>
                    {t.environments.environments[environment]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPONENTS.map((component) => (
                <tr key={component} data-testid={`spec-013-component-${component}`}>
                  <th scope="row" className={`${cell} font-semibold`}>
                    {t.environments.components[component]}
                  </th>
                  {ENVIRONMENTS.map((environment) => (
                    <td
                      key={environment}
                      data-testid={`spec-013-cell-${component}-${environment}`}
                      className={cell}
                    >
                      {t.environments.cells[environment][component]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DemoSection>

      <DemoSection testId="spec-013-regions" title={t.regions.title}>
        <p>{t.regions.intro}</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          {REGION_SERVICES.map((service: HostingService) => {
            const value = report.regions?.[service] ?? HOSTING_REGIONS[service];
            const eu = isEuRegion(value);
            return (
              <li
                key={service}
                data-testid={`spec-013-region-${service}`}
                className="rounded-[12px] border border-solid border-[#E7E6E1] px-4 py-3"
              >
                <p className="font-semibold">{t.regions.services[service]}</p>
                <p className="font-mono text-sm">{value}</p>
                <p className="text-sm">{eu ? t.regions.eu : t.regions.outsideEu}</p>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-sm">
          {t.regions.source} · {t.regions.expected} : {HOSTING_REGIONS.vercel},{' '}
          {HOSTING_REGIONS.supabase}, {HOSTING_REGIONS.inngest}
        </p>
      </DemoSection>

      <DemoSection testId="spec-013-dry-run" title={t.dryRun.title}>
        <p>{t.dryRun.intro}</p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt>{t.dryRun.environment}</dt>
          <dd data-testid="spec-013-dry-run-environment" className="font-mono">
            {report.envName ?? '—'}
          </dd>
          <dt>{t.dryRun.status}</dt>
          <dd data-testid="spec-013-dry-run-status" className="font-medium">
            {report.status === 'ok' ? t.dryRun.statusOk : t.dryRun.statusKo}
          </dd>
        </dl>

        <h3 className="mt-5 font-semibold">{t.dryRun.actions}</h3>
        <div role="region" aria-label={t.dryRun.actions} tabIndex={0} className={region}>
          <table className="mt-2 w-full text-left">
            <thead>
              <tr>
                <th scope="col" className={cell}>
                  {t.dryRun.action}
                </th>
                <th scope="col" className={cell}>
                  {t.dryRun.destination}
                </th>
              </tr>
            </thead>
            <tbody>
              {report.actions.map((action) => (
                <tr key={action.id} data-testid={`spec-013-dry-run-action-${action.id}`}>
                  <td className={cell}>{action.label}</td>
                  <td className={`${cell} font-mono`}>{action.destination}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="mt-5 font-semibold">{t.dryRun.warnings}</h3>
        {report.warnings.length === 0 ? (
          <p>{t.dryRun.none}</p>
        ) : (
          <ul
            data-testid="spec-013-dry-run-warnings"
            className="mt-1 list-disc space-y-1 pl-6 text-sm"
          >
            {report.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}

        <h3 className="mt-5 font-semibold">{t.dryRun.errors}</h3>
        {report.errors.length === 0 ? (
          <p data-testid="spec-013-dry-run-errors">{t.dryRun.none}</p>
        ) : (
          <ul
            data-testid="spec-013-dry-run-errors"
            className="mt-1 list-disc space-y-1 pl-6 text-sm"
          >
            {report.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-sm">{t.dryRun.noNetwork}</p>
      </DemoSection>
    </>
  );
}
