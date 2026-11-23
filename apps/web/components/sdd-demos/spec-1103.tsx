import { Card, CardHeader } from '@learny/ui';

import { readApiDeploymentTopologies } from '../../lib/api-deployment-topology';

interface ApiSnapshot {
  status: string;
}

// SPEC-2207 retired Inngest: the jobs run in the Python worker, so the API exposes no function
// registry any more and the demonstration only reports the health of the API process.
async function readApiSnapshot(): Promise<ApiSnapshot> {
  const origin = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001';
  let status = 'indisponible';
  try {
    const health = await fetch(new URL('/health', origin), { cache: 'no-store' });
    const body = (await health.json().catch(() => null)) as Partial<ApiSnapshot> | null;
    status = health.ok && body?.status === 'ok' ? 'ok' : 'erreur';
  } catch {
    // The API is unreachable: the status stays « indisponible ».
  }
  return { status };
}

export default async function Spec1103Demo() {
  const topologies = readApiDeploymentTopologies();
  const snapshot = await readApiSnapshot();
  const role = process.env.LEARNY_API_ROLE ?? 'all';

  return (
    <>
      <Card className="mt-6" data-testid="spec-1103-topology" labelledBy="spec-1103-topology-title">
        <CardHeader title="Topologie de déploiement" titleId="spec-1103-topology-title" />
        <ul className="mt-4 grid gap-3 lg:grid-cols-2">
          {topologies.map((topology) => (
            <li
              className="rounded-[12px] border border-solid border-border p-4"
              data-testid="spec-1103-compose"
              key={topology.file}
            >
              <p className="break-all font-mono font-semibold">{topology.file}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {topology.services.map((service) => (
                  <li key={service.name}>
                    <span className="font-mono font-medium">{service.name}</span>
                    {' · '}
                    {service.dependencies.length > 0
                      ? `dépend de ${service.dependencies.join(', ')}`
                      : 'aucune dépendance'}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-4" data-testid="spec-1103-role" labelledBy="spec-1103-role-title">
        <CardHeader title="Processus API" titleId="spec-1103-role-title" />
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="font-medium">Rôle</dt>
          <dd className="font-mono" data-testid="spec-1103-role-value">
            {role}
          </dd>
          <dt className="font-medium">Santé</dt>
          <dd className="font-mono" data-testid="spec-1103-health">
            {snapshot.status}
          </dd>
        </dl>
      </Card>
    </>
  );
}
