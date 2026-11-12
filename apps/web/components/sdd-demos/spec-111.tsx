import { loadSpec111Demo, type Spec111Data } from '../../app/%5Fdev/sdd/spec-111-data';
import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

const t = fr.sdd.spec111;

function Code({ data }: Readonly<{ data: Spec111Data }>) {
  return (
    <DemoSection testId="spec-111-code" title={t.code.title}>
      <p className="mb-3 text-sm">{t.code.intro}</p>
      <p className="text-sm font-semibold">{t.code.label}</p>
      <p className="mt-1">
        <code className="font-mono text-2xl tracking-widest" data-testid="group-code">
          {data.code}
        </code>
      </p>
      <p className="mt-2 text-sm" data-testid="group-code-warning">
        {t.code.fake}
      </p>
      <p className="mt-3 text-sm">{t.code.formation}</p>
    </DemoSection>
  );
}

function Capacity({ data }: Readonly<{ data: Spec111Data }>) {
  const { used, max } = data.capacity;
  return (
    <DemoSection testId="spec-111-capacity" title={t.capacity.title}>
      <p className="mb-3 text-sm">{t.capacity.intro}</p>
      <label className="text-sm font-semibold" htmlFor="group-capacity-gauge">
        {t.capacity.gauge}
      </label>
      <p className="mt-1 text-2xl font-semibold" data-testid="group-capacity">
        {t.capacity.value(used, max)}
      </p>
      <progress
        id="group-capacity-gauge"
        className="mt-2 h-3 w-full"
        max={max}
        value={used}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={used}
        aria-valuetext={t.capacity.value(used, max)}
      />
    </DemoSection>
  );
}

function Progress({ data }: Readonly<{ data: Spec111Data }>) {
  return (
    <DemoSection testId="spec-111-progress" title={t.progress.title}>
      <p className="mb-3 text-sm">{t.progress.intro}</p>
      <div
        role="region"
        aria-label={t.progress.region}
        tabIndex={0}
        className="mt-4 overflow-x-auto rounded-[8px] border border-solid border-[#E7E6E1]"
      >
        <table className="w-full min-w-[36rem] text-left">
          <thead>
            <tr>
              <th scope="col" className="px-3 py-2">
                {t.progress.firstName}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.progress.module}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.progress.validated}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.progress.streak}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.progress.map((row) => (
              <tr
                key={row.userId}
                data-testid="group-progress-row"
                className="border-t border-[#E7E6E1]"
              >
                <td className="px-3 py-2" data-testid="group-progress-name">
                  {row.firstName ?? '—'}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="group-progress-module">
                  {t.progress.moduleLabel(row.currentModulePosition)}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="group-progress-validated">
                  {row.validatedModules}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="group-progress-streak">
                  {row.streakDays}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DemoSection>
  );
}

function ActiveCount({ data }: Readonly<{ data: Spec111Data }>) {
  return (
    <DemoSection testId="spec-111-active-count" title={t.active.title}>
      <p className="mb-3 text-sm">{t.active.intro}</p>
      <p className="text-2xl font-semibold" data-testid="group-active-count">
        {t.active.count(data.activeCount)}
      </p>
      <p className="mt-2 text-sm">{t.active.rule}</p>
    </DemoSection>
  );
}

export default async function Spec111Demo() {
  let data: Spec111Data;
  try {
    data = await loadSpec111Demo();
  } catch {
    return (
      <div className="mt-6">
        <p role="alert">{fr.sdd.spec101.unavailable}</p>
      </div>
    );
  }

  return (
    <>
      <p className="mt-6 text-sm">{t.intro}</p>
      <Code data={data} />
      <Capacity data={data} />
      <Progress data={data} />
      <ActiveCount data={data} />
    </>
  );
}
