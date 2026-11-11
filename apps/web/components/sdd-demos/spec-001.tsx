import { clock } from '@learny/core';
import { HOSTING_REGIONS, isEuRegion, type HostingService } from '@learny/config';

import { getHealth } from '../../lib/health';
import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

const WORKSPACE_PACKAGES = [
  { name: '@learny/web', role: 'Application web Next.js (pages, route handlers /api/v1)' },
  { name: '@learny/core', role: 'Primitives partagées (horloge injectable)' },
  { name: '@learny/config', role: 'Configuration produit et plateforme (régions UE)' },
] as const;

const t = fr.sdd.spec001;

export default function Spec001Demo() {
  const health = getHealth();
  const services = Object.keys(HOSTING_REGIONS) as HostingService[];

  return (
    <>
      <DemoSection testId="spec-001-workspace" title={t.workspace.title}>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th scope="col" className="py-2 pr-4">
                {t.workspace.packageHeader}
              </th>
              <th scope="col" className="py-2">
                {t.workspace.roleHeader}
              </th>
            </tr>
          </thead>
          <tbody>
            {WORKSPACE_PACKAGES.map((p) => (
              <tr key={p.name}>
                <td className="py-2 pr-4 font-mono">{p.name}</td>
                <td className="py-2">{p.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DemoSection>
      <DemoSection testId="spec-001-health" title={t.health.title}>
        <p>{`${t.health.status} : ${health.status}`}</p>
      </DemoSection>
      <DemoSection testId="spec-001-regions" title={t.regions.title}>
        <ul>
          {services.map((service) => {
            const region = HOSTING_REGIONS[service];
            return (
              <li key={service} data-testid={`region-${service}`}>
                {`${t.regions.services[service]} : ${region} — ${
                  isEuRegion(region) ? t.regions.eu : t.regions.outsideEu
                }`}
              </li>
            );
          })}
        </ul>
      </DemoSection>
      <DemoSection testId="spec-001-clock" title={t.clock.title}>
        <p>{`CLOCK_FIXED_AT = ${process.env.CLOCK_FIXED_AT ?? ''}`}</p>
        <p>{`clock.now() = ${clock.now().toISOString()}`}</p>
      </DemoSection>
    </>
  );
}
