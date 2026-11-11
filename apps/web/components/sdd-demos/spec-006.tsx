import { sddDemos } from '../../app/%5Fdev/sdd/registry';
import { getHealth, type DatabaseQuery } from '../../lib/health';
import { sddPagesEnabled } from '../../lib/sdd-pages';
import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

import { Spec006Client } from './spec-006-client';

const t = fr.sdd.spec006;

// Simulated probes: the failing one carries an internal host name that must never be shown.
const PROBES: { id: keyof typeof t.health.probes; query: DatabaseQuery | null }[] = [
  { id: 'ok', query: () => Promise.resolve([{ ok: 1 }]) },
  {
    id: 'unavailable',
    query: () => Promise.reject(new Error('connect ECONNREFUSED db.internal.learny:5432')),
  },
  { id: 'not_configured', query: null },
];

const GUARD_CASES: { flag: string | undefined; env: string }[] = [
  { flag: 'true', env: 'test' },
  { flag: 'TRUE', env: 'test' },
  { flag: '1', env: 'test' },
  { flag: '', env: 'test' },
  { flag: undefined, env: 'test' },
  { flag: 'true', env: 'production' },
];

const cell = 'py-2 pr-4 align-top';
const region = 'overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2';

function flagLabel(flag: string | undefined): string {
  if (flag === undefined) return t.sdd.unset;
  return flag === '' ? t.sdd.empty : flag;
}

export default async function Spec006Demo() {
  const current = await getHealth();
  const simulated = await Promise.all(
    PROBES.map(async (p) => ({ id: p.id, ...(await getHealth({ query: p.query })) })),
  );
  const enabled = sddPagesEnabled();
  const demos = Object.entries(sddDemos).sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
      <DemoSection testId="spec-006-health" title={t.health.title}>
        <h3 className="font-semibold">{`${t.health.current} (HTTP ${String(current.httpStatus)})`}</h3>
        <dl
          data-testid="spec-006-health-current"
          className="mt-2 grid grid-cols-[auto_1fr] gap-x-4"
        >
          {(['status', 'version', 'commit', 'database'] as const).map((field) => (
            <div key={field} className="contents">
              <dt className="font-mono">{field}</dt>
              <dd data-testid={`spec-006-health-${field}`} className="font-mono">
                {current.body[field]}
              </dd>
            </div>
          ))}
        </dl>
        <h3 className="mt-6 font-semibold">{t.health.simulated}</h3>
        <div role="region" aria-label={t.health.simulated} tabIndex={0} className={region}>
          <table className="mt-2 w-full text-left">
            <thead>
              <tr>
                <th scope="col" className={cell}>
                  {t.health.probe}
                </th>
                <th scope="col" className={cell}>
                  {t.health.http}
                </th>
                <th scope="col" className={cell}>
                  {t.health.status}
                </th>
                <th scope="col" className={cell}>
                  {t.health.database}
                </th>
              </tr>
            </thead>
            <tbody>
              {simulated.map((r) => (
                <tr key={r.id} data-testid={`spec-006-probe-${r.id}`}>
                  <td className={cell}>{t.health.probes[r.id]}</td>
                  <td className={`${cell} font-mono`}>{r.httpStatus}</td>
                  <td className={`${cell} font-mono`}>{r.body.status}</td>
                  <td className={`${cell} font-mono`}>{r.body.database}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DemoSection>

      <DemoSection testId="spec-006-sdd" title={t.sdd.title}>
        <p data-testid="spec-006-sdd-current">
          {`${t.sdd.current} : ${enabled ? t.sdd.enabled : t.sdd.disabled} · ${t.sdd.noindex}`}
        </p>
        <h3 className="mt-6 font-semibold">{t.sdd.cases}</h3>
        <div role="region" aria-label={t.sdd.cases} tabIndex={0} className={region}>
          <table className="mt-2 w-full text-left">
            <thead>
              <tr>
                <th scope="col" className={cell}>
                  {t.sdd.flag}
                </th>
                <th scope="col" className={cell}>
                  {t.sdd.env}
                </th>
                <th scope="col" className={cell}>
                  {t.sdd.result}
                </th>
              </tr>
            </thead>
            <tbody>
              {GUARD_CASES.map((c) => {
                const ok = sddPagesEnabled({ ENABLE_SDD_PAGES: c.flag, APP_ENV: c.env });
                return (
                  <tr key={`${flagLabel(c.flag)}-${c.env}`} data-testid="spec-006-guard-case">
                    <td className={`${cell} font-mono`}>{flagLabel(c.flag)}</td>
                    <td className={`${cell} font-mono`}>{c.env}</td>
                    <td className={cell}>{ok ? t.sdd.enabled : t.sdd.disabled}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <h3 className="mt-6 font-semibold">{t.sdd.registered}</h3>
        <ul data-testid="spec-006-sdd-registry" className="mt-2">
          {demos.map(([id, demo]) => (
            <li key={id}>
              <span className="font-mono">{id}</span> — {demo.title}
            </li>
          ))}
        </ul>
      </DemoSection>

      <DemoSection testId="spec-006-client" title={t.client.title}>
        <Spec006Client />
      </DemoSection>
    </>
  );
}
