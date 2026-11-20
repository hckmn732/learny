import { fr } from '@learny/i18n/fr/sdd';

import { serverApi } from '../../lib/api/server-client';
import { DemoSection } from '../sdd/demo-shell';

import { DemoJobRunner } from './spec-007-run';

const t = fr.sdd.spec007;

const HOSTS = [
  { id: t.hosts.web, adapter: t.hosts.webAdapter, endpoint: t.hosts.webEndpoint },
  { id: t.hosts.worker, adapter: t.hosts.workerAdapter, endpoint: t.hosts.workerEndpoint },
] as const;

export default async function Spec007Demo() {
  const data = (await (await serverApi()).api.devSddSpec007Demo({})) as {
    ids: string;
    retries: number;
  };

  return (
    <>
      <DemoSection testId="spec-007-hosts" title={t.hosts.title}>
        <ul className="grid gap-4 sm:grid-cols-2">
          {HOSTS.map((h) => (
            <li key={h.id} data-testid={`spec-007-host-${h.id}`}>
              <p className="font-mono font-semibold">{h.id}</p>
              <p className="mt-1">
                {`${t.hosts.adapter} : `}
                <span className="font-mono">{h.adapter}</span>
              </p>
              <p className="mt-1">
                {`${t.hosts.endpoint} : `}
                <span className="font-mono">{h.endpoint}</span>
              </p>
            </li>
          ))}
        </ul>
        <p data-testid="spec-007-registry" className="mt-4 font-mono">
          {t.hosts.registry(data.ids, data.retries)}
        </p>
      </DemoSection>
      <DemoJobRunner />
    </>
  );
}
