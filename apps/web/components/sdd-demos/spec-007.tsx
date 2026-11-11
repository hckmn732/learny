import { JOB_RETRIES, functions } from '@learny/jobs';

import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

import { DemoJobRunner } from './spec-007-run';

const t = fr.sdd.spec007;

const HOSTS = [
  { id: t.hosts.web, adapter: t.hosts.webAdapter, endpoint: t.hosts.webEndpoint },
  { id: t.hosts.worker, adapter: t.hosts.workerAdapter, endpoint: t.hosts.workerEndpoint },
] as const;

export default function Spec007Demo() {
  const ids = functions.map((f) => f.id()).join(', ');

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
          {t.hosts.registry(ids, JOB_RETRIES)}
        </p>
      </DemoSection>
      <DemoJobRunner />
    </>
  );
}
