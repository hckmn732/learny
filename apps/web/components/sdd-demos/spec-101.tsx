import {
  ENUMS,
  ENUM_NAMES,
  EXTENSIONS,
  UNACCENT_EXPECTED,
  loadSpec101Demo,
  type Identity,
  type Spec101Data,
} from '../../app/%5Fdev/sdd/spec-101-data';
import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

const t = fr.sdd.spec101;

function CheckBadge({ testId, ok }: Readonly<{ testId: string; ok: boolean }>) {
  return (
    <span
      data-testid={testId}
      className={`inline-block rounded-full px-2 py-0.5 text-sm whitespace-nowrap ${
        ok ? 'bg-green-soft text-green-ink' : 'bg-orange-soft text-danger'
      }`}
    >
      {ok ? t.conform : t.nonConform}
    </span>
  );
}

export default async function Spec101Demo() {
  let data: Spec101Data;
  try {
    data = await loadSpec101Demo();
  } catch {
    return (
      <DemoSection testId="db-extensions" title={t.extensions.title}>
        <p role="alert">{t.unavailable}</p>
      </DemoSection>
    );
  }

  const { extensions, migrations, functions, enums, rls } = data;
  const extensionByName = new Map(extensions.map((extension) => [extension.name, extension]));
  const functionNames = new Set(functions.map((row) => row.name));
  const sample = functions.find((row) => row.name === 'immutable_unaccent_sample')?.value ?? '';
  const enumByName = new Map(enums.map((row) => [row.name, row.values]));
  const migrationsApplied =
    migrations.some((row) => row.name === 'extensions_and_shared') &&
    migrations.some((row) => row.name === 'shared_enums');

  const identityOk = (identity: Identity, userId: string): boolean =>
    identity.role === 'authenticated' && identity.uid === userId;
  const serviceOk = rls.service.role === 'postgres' && rls.service.uid === null;

  return (
    <>
      <DemoSection testId="db-extensions" title={t.extensions.title}>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th scope="col" className="py-2 pr-4">
                {t.extensions.name}
              </th>
              <th scope="col" className="py-2 pr-4">
                {t.extensions.version}
              </th>
              <th scope="col" className="py-2">
                {t.functions.status}
              </th>
            </tr>
          </thead>
          <tbody>
            {EXTENSIONS.map((name) => {
              const extension = extensionByName.get(name);
              return (
                <tr key={name}>
                  <td className="py-2 pr-4 font-mono">{name}</td>
                  <td className="py-2 pr-4 font-mono" data-testid="db-variable">
                    {extension?.version ?? '—'}
                  </td>
                  <td className="py-2">
                    <CheckBadge testId={`check-extension-${name}`} ok={extension !== undefined} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DemoSection>

      <DemoSection testId="db-migrations" title={t.migrations.title}>
        <p className="mb-3 text-sm" data-testid="db-migrations-total">
          {t.migrations.total(migrations.length)}
        </p>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th scope="col" className="py-2 pr-4">
                {t.migrations.version}
              </th>
              <th scope="col" className="py-2 pr-4">
                {t.migrations.name}
              </th>
              <th scope="col" className="py-2">
                {t.functions.status}
              </th>
            </tr>
          </thead>
          <tbody>
            {migrations.map((migration) => (
              <tr key={migration.version} data-testid="db-migration-row">
                <td className="py-2 pr-4 font-mono" data-testid="db-variable">
                  {migration.version}
                </td>
                <td className="py-2 pr-4 font-mono" data-testid="db-variable">
                  {migration.name}
                </td>
                <td className="py-2">
                  <CheckBadge testId="check-migrations" ok={migrationsApplied} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DemoSection>

      <DemoSection testId="db-functions" title={t.functions.title}>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th scope="col" className="py-2 pr-4">
                {t.functions.name}
              </th>
              <th scope="col" className="py-2 pr-4">
                {t.functions.result}
              </th>
              <th scope="col" className="py-2">
                {t.functions.status}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-2 pr-4 font-mono">set_updated_at</td>
              <td className="py-2 pr-4">—</td>
              <td className="py-2">
                <CheckBadge
                  testId="check-function-set-updated-at"
                  ok={functionNames.has('set_updated_at')}
                />
              </td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono">immutable_unaccent</td>
              <td className="py-2 pr-4" data-testid="db-functions-sample">
                {sample}
              </td>
              <td className="py-2">
                <CheckBadge
                  testId="check-function-immutable-unaccent"
                  ok={functionNames.has('immutable_unaccent') && sample === UNACCENT_EXPECTED}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </DemoSection>

      <DemoSection testId="db-enums" title={t.enums.title}>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th scope="col" className="py-2 pr-4">
                {t.enums.name}
              </th>
              <th scope="col" className="py-2 pr-4">
                {t.enums.values}
              </th>
              <th scope="col" className="py-2">
                {t.functions.status}
              </th>
            </tr>
          </thead>
          <tbody>
            {ENUM_NAMES.map((name) => {
              const values = enumByName.get(name) ?? [];
              const ok = values.join(',') === ENUMS[name].join(',');
              return (
                <tr key={name}>
                  <td className="py-2 pr-4 font-mono">{name}</td>
                  <td className="py-2 pr-4 font-mono">{values.join(', ')}</td>
                  <td className="py-2">
                    <CheckBadge testId={`check-enum-${name}`} ok={ok} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DemoSection>

      <DemoSection testId="db-rls-identity" title={t.rls.title}>
        <p className="mb-3 text-sm">{t.rls.intro}</p>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th scope="col" className="py-2 pr-4">
                {t.rls.actor}
              </th>
              <th scope="col" className="py-2 pr-4">
                {t.rls.uid}
              </th>
              <th scope="col" className="py-2 pr-4">
                {t.rls.role}
              </th>
              <th scope="col" className="py-2">
                {t.functions.status}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-2 pr-4">{t.rls.userA}</td>
              <td className="py-2 pr-4 font-mono" data-testid="db-variable">
                {rls.userA.identity.uid ?? t.rls.none}
              </td>
              <td className="py-2 pr-4 font-mono">{rls.userA.identity.role}</td>
              <td className="py-2">
                <CheckBadge
                  testId="check-rls-a"
                  ok={identityOk(rls.userA.identity, rls.userA.id)}
                />
              </td>
            </tr>
            <tr>
              <td className="py-2 pr-4">{t.rls.userB}</td>
              <td className="py-2 pr-4 font-mono" data-testid="db-variable">
                {rls.userB.identity.uid ?? t.rls.none}
              </td>
              <td className="py-2 pr-4 font-mono">{rls.userB.identity.role}</td>
              <td className="py-2">
                <CheckBadge
                  testId="check-rls-b"
                  ok={identityOk(rls.userB.identity, rls.userB.id)}
                />
              </td>
            </tr>
            <tr>
              <td className="py-2 pr-4">{t.rls.service}</td>
              <td className="py-2 pr-4 font-mono" data-testid="db-variable">
                {rls.service.uid ?? t.rls.none}
              </td>
              <td className="py-2 pr-4 font-mono">{rls.service.role}</td>
              <td className="py-2">
                <CheckBadge testId="check-rls-service" ok={serviceOk} />
              </td>
            </tr>
          </tbody>
        </table>
      </DemoSection>
    </>
  );
}
