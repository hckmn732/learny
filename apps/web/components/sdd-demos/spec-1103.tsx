import { Card, CardHeader } from '@learny/ui';

import { readApiDeploymentTopologies } from '../../lib/api-deployment-topology';

interface ApiSnapshot {
  status: string;
  functionIds: string[];
}

function functionId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  for (const key of ['id', 'name', 'slug']) {
    if (typeof record[key] === 'string') return record[key];
  }
  return null;
}

async function readApiSnapshot(): Promise<ApiSnapshot> {
  const origin = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001';
  const [health, registry] = await Promise.allSettled([
    fetch(new URL('/health', origin), { cache: 'no-store' }),
    fetch(new URL('/api/inngest', origin), { cache: 'no-store' }),
  ]);
  let status = 'indisponible';
  if (health.status === 'fulfilled') {
    const body = (await health.value.json().catch(() => null)) as Partial<ApiSnapshot> | null;
    status = health.value.ok && body?.status === 'ok' ? 'ok' : 'erreur';
  }
  let functionIds: string[] = [];
  if (registry.status === 'fulfilled' && registry.value.ok) {
    const body = (await registry.value.json().catch(() => null)) as {
      functions?: unknown[];
    } | null;
    functionIds = (body?.functions ?? []).map(functionId).filter((id): id is string => id !== null);
  }
  return { status, functionIds };
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

      <Card className="mt-4" data-testid="spec-1103-functions" labelledBy="spec-1103-functions-title">
        <CardHeader title="Fonctions Inngest" titleId="spec-1103-functions-title" />
        <ul className="mt-4 columns-1 list-disc space-y-1 pl-5 md:columns-2">
          {snapshot.functionIds.map((id) => (
            <li className="break-inside-avoid font-mono text-sm" key={id}>
              {id}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
