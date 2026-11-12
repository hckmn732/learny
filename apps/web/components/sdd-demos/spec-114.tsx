import { STORAGE_BUCKETS, resourcePath, type StorageBucket } from '@learny/db';

import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

const t = fr.sdd.spec114;

// Fixed fictional identifiers: the page never shows a real user, resource or signed token.
const DEMO_USER = '11111111-1111-4111-8111-111111111111';
const DEMO_RESOURCE = '22222222-2222-4222-8222-222222222222';
const DEMO_PATH = resourcePath(DEMO_USER, DEMO_RESOURCE, 'guide.pdf');

const BUCKETS: StorageBucket[] = [STORAGE_BUCKETS.resources, STORAGE_BUCKETS.exports];

const ACCESS_ROWS = [
  { key: 'list', owner: true, member: false, anonymous: false },
  { key: 'upload', owner: true, member: false, anonymous: false },
  { key: 'read', owner: true, member: false, anonymous: false },
  { key: 'delete', owner: true, member: false, anonymous: false },
  { key: 'export', owner: true, member: false, anonymous: false },
] as const;

function Buckets() {
  return (
    <DemoSection testId="spec-114-buckets" title={t.buckets.title}>
      <p className="mb-4 text-sm">{t.buckets.intro}</p>
      <ul aria-label={t.buckets.label} className="grid gap-3 sm:grid-cols-2">
        {BUCKETS.map((bucket) => (
          <li
            key={bucket}
            data-testid="spec-114-bucket"
            data-bucket={bucket}
            data-private="true"
            className="rounded-[8px] border border-solid border-[#E7E6E1] p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <code className="font-mono text-sm font-semibold">{bucket}</code>
              <span
                data-testid="spec-114-bucket-badge"
                className="rounded-full border border-solid border-[#1F7A3A] px-2 py-0.5 text-xs font-semibold text-[#1F7A3A]"
              >
                {t.buckets.private}
              </span>
            </div>
            <p className="mt-2 text-sm">{t.buckets.items[bucket]}</p>
          </li>
        ))}
      </ul>
    </DemoSection>
  );
}

function Path() {
  return (
    <DemoSection testId="spec-114-path" title={t.path.title}>
      <p className="mb-4 text-sm">{t.path.intro}</p>
      <code
        data-testid="spec-114-path-value"
        className="block overflow-x-auto rounded-[8px] border border-solid border-[#E7E6E1] px-3 py-2 font-mono text-sm"
      >
        {DEMO_PATH}
      </code>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="font-semibold">{t.path.user}</dt>
          <dd className="font-mono text-xs">{DEMO_USER}</dd>
        </div>
        <div>
          <dt className="font-semibold">{t.path.object}</dt>
          <dd className="font-mono text-xs">{DEMO_RESOURCE}</dd>
        </div>
        <div>
          <dt className="font-semibold">{t.path.name}</dt>
          <dd className="font-mono text-xs">guide.pdf</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm">{t.path.fake}</p>
    </DemoSection>
  );
}

function Ttl() {
  return (
    <DemoSection testId="spec-114-ttl" title={t.ttl.title}>
      <p className="mb-3 text-sm">{t.ttl.intro}</p>
      <p data-testid="spec-114-ttl-value" className="text-2xl font-semibold">
        {t.ttl.value}
      </p>
      <p className="mt-2 text-sm">{t.ttl.expiry}</p>
      <p className="mt-2 text-sm">{t.ttl.secret}</p>
    </DemoSection>
  );
}

function Cell({ allowed }: Readonly<{ allowed: boolean }>) {
  return (
    <td
      data-testid="spec-114-access-cell"
      data-allowed={allowed ? 'true' : 'false'}
      className="px-3 py-2"
    >
      {allowed ? t.access.allowed : t.access.denied}
    </td>
  );
}

function Access() {
  return (
    <DemoSection testId="spec-114-access" title={t.access.title}>
      <p className="mb-3 text-sm">{t.access.intro}</p>
      <div
        role="region"
        aria-label={t.access.title}
        tabIndex={0}
        className="overflow-x-auto rounded-[8px] border border-solid border-[#E7E6E1]"
      >
        <table className="w-full min-w-[32rem] text-left">
          <thead>
            <tr>
              <th scope="col" className="px-3 py-2">
                {t.access.role}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.access.owner}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.access.member}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.access.anonymous}
              </th>
            </tr>
          </thead>
          <tbody>
            {ACCESS_ROWS.map((row) => (
              <tr
                key={row.key}
                data-testid="spec-114-access-row"
                data-key={row.key}
                className="border-t border-[#E7E6E1]"
              >
                <th scope="row" className="px-3 py-2 font-medium">
                  {t.access.rows[row.key]}
                </th>
                <Cell allowed={row.owner} />
                <Cell allowed={row.member} />
                <Cell allowed={row.anonymous} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm">{t.access.note}</p>
    </DemoSection>
  );
}

export default function Spec114Demo() {
  return (
    <>
      <p className="mt-6 text-sm">{t.intro}</p>
      <Buckets />
      <Path />
      <Ttl />
      <Access />
    </>
  );
}
