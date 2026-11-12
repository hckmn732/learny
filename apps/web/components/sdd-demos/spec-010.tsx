import type { ComponentStatus } from '@learny/contracts';

import { buildObservabilityDemo } from '../../lib/sdd-observability-demo';
import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

const t = fr.sdd.spec010;

const STATUS_META: Record<ComponentStatus, { icon: string; label: string }> = {
  ok: { icon: '✓', label: t.health.ok },
  unavailable: { icon: '✕', label: t.health.unavailable },
  not_configured: { icon: '–', label: t.health.not_configured },
};

function Status({ status, testId }: Readonly<{ status: ComponentStatus; testId: string }>) {
  const meta = STATUS_META[status];
  return (
    <span data-testid={testId} className="whitespace-nowrap">
      <span aria-hidden="true">{meta.icon}</span>
      {` ${meta.label}`}
      <span className="sr-only">{` (${status})`}</span>
    </span>
  );
}

export default async function Spec010Demo() {
  const demo = await buildObservabilityDemo();
  const scrollRegion =
    'mt-2 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2';

  return (
    <>
      <DemoSection testId="spec-010-context" title={t.context.title}>
        <p className="text-sm">{t.context.note}</p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt>{t.context.requestId}</dt>
          <dd data-testid="spec-010-request-id" className="font-mono break-all">
            {demo.requestId}
          </dd>
          <dt>{t.context.userId}</dt>
          <dd data-testid="spec-010-user-id" className="font-mono break-all">
            {demo.userId}
          </dd>
          <dt>{t.context.route}</dt>
          <dd data-testid="spec-010-route" className="font-mono break-all">
            /api/v1/health
          </dd>
        </dl>
        <p className="mt-2 text-sm font-medium">{t.log.demo}</p>
      </DemoSection>

      <DemoSection testId="spec-010-log" title={t.log.title}>
        <p className="text-sm">{t.log.note}</p>
        <div role="region" aria-label={t.log.region} tabIndex={0} className={scrollRegion}>
          <pre
            data-testid="spec-010-log-json"
            className="w-max rounded-[16px] border border-solid border-border p-4 font-mono text-xs"
          >
            {demo.log}
          </pre>
        </div>
      </DemoSection>

      <DemoSection testId="spec-010-error" title={t.error.title}>
        <p className="text-sm">{t.error.note}</p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt>{t.error.status}</dt>
          <dd data-testid="spec-010-error-status" className="font-mono">
            {demo.error.status}
          </dd>
          <dt>{t.error.code}</dt>
          <dd data-testid="spec-010-error-code" className="font-mono break-all">
            {demo.error.code}
          </dd>
          <dt>{t.error.requestId}</dt>
          <dd data-testid="spec-010-error-request-id" className="font-mono break-all">
            {demo.error.requestId}
          </dd>
        </dl>
        <div role="region" aria-label={t.error.region} tabIndex={0} className={scrollRegion}>
          <pre
            data-testid="spec-010-error-json"
            className="w-max rounded-[16px] border border-solid border-border p-4 font-mono text-xs"
          >
            {demo.errorJson}
          </pre>
        </div>
      </DemoSection>

      <DemoSection testId="spec-010-health" title={t.health.title}>
        <p className="text-sm">{t.health.note}</p>
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr>
              <th scope="col" className="py-2 pr-4">
                {t.health.component}
              </th>
              <th scope="col" className="py-2">
                {t.health.status}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-2 pr-4">{t.health.database}</td>
              <td className="py-2">
                <Status
                  status={demo.health.components.database}
                  testId="spec-010-health-database"
                />
              </td>
            </tr>
            <tr>
              <td className="py-2 pr-4">{t.health.build}</td>
              <td className="py-2">
                <Status status={demo.health.components.build} testId="spec-010-health-build" />
              </td>
            </tr>
          </tbody>
        </table>

        <h3 className="mt-6 font-semibold">{t.health.probes}</h3>
        <p className="mt-1 text-sm">{t.health.probesNote}</p>
        <ul className="mt-2 grid gap-1 text-sm">
          {(
            [
              ['ok', demo.demoProbes.ok],
              ['unavailable', demo.demoProbes.unavailable],
              ['not_configured', demo.demoProbes.notConfigured],
            ] as const
          ).map(([id, status]) => (
            <li key={id}>
              <Status status={status} testId={`spec-010-health-probe-${id}`} />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm font-medium">{t.health.demo}</p>
      </DemoSection>
    </>
  );
}
