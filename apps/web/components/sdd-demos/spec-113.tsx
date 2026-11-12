import { loadSpec113Demo, type Spec113Data } from '../../app/%5Fdev/sdd/spec-113-data';
import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

const t = fr.sdd.spec113;

function Count({ data }: Readonly<{ data: Spec113Data }>) {
  return (
    <DemoSection testId="spec-113-count" title={t.count.title}>
      <p className="mb-3 text-sm">{t.count.intro}</p>
      <p className="text-2xl font-semibold" data-testid="spec-113-summary">
        {t.count.summary(data.tableCount, data.rlsCount, data.policyCount)}
      </p>
      <p className="mt-2 text-sm" data-testid="spec-113-forced">
        {t.count.forced(data.forcedCount)}
      </p>
    </DemoSection>
  );
}

function Categories({ data }: Readonly<{ data: Spec113Data }>) {
  return (
    <DemoSection testId="spec-113-categories" title={t.categories.title}>
      <p className="mb-3 text-sm">{t.categories.intro}</p>
      <ul aria-label={t.categories.list} className="space-y-2">
        {data.categories.map((entry) => (
          <li
            key={entry.category}
            data-testid="spec-113-category"
            data-category={entry.category}
            className="flex items-center justify-between rounded-[8px] border border-solid border-[#E7E6E1] px-3 py-2"
          >
            <span>{t.categories.labels[entry.category]}</span>
            <span className="font-mono text-sm" data-testid="spec-113-category-count">
              {t.categories.count(entry.count)}
            </span>
          </li>
        ))}
      </ul>
    </DemoSection>
  );
}

function Cells({ cells }: Readonly<{ cells: { a: boolean; b: boolean; c: boolean } }>) {
  return (
    <>
      {(['a', 'b', 'c'] as const).map((role) => (
        <td
          key={role}
          data-testid="spec-113-cell"
          data-role={role}
          data-allowed={cells[role] ? 'true' : 'false'}
          className="px-3 py-2"
        >
          {cells[role] ? t.matrix.allowed : t.matrix.denied}
        </td>
      ))}
    </>
  );
}

function Matrix({ data }: Readonly<{ data: Spec113Data }>) {
  return (
    <DemoSection testId="spec-113-matrix" title={t.matrix.title}>
      <p className="mb-3 text-sm">{t.matrix.intro}</p>
      <div
        role="region"
        aria-label={t.matrix.title}
        tabIndex={0}
        className="overflow-x-auto rounded-[8px] border border-solid border-[#E7E6E1]"
      >
        <table className="w-full min-w-[36rem] text-left">
          <thead>
            <tr>
              <th scope="col" className="px-3 py-2">
                {t.matrix.role}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.matrix.a}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.matrix.b}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.matrix.c}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.matrix.map((row) => (
              <tr
                key={row.key}
                data-testid="spec-113-matrix-row"
                data-key={row.key}
                className="border-t border-[#E7E6E1]"
              >
                <th scope="row" className="px-3 py-2 font-medium">
                  {t.matrix.rows[row.key]}
                </th>
                <Cells cells={row.cells} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm">{t.matrix.note}</p>
    </DemoSection>
  );
}

export default async function Spec113Demo() {
  let data: Spec113Data;
  try {
    data = await loadSpec113Demo();
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
      <Count data={data} />
      <Categories data={data} />
      <Matrix data={data} />
    </>
  );
}
