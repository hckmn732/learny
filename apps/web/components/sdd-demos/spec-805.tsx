import {
  loadSpec805Report,
  type SecurityCategory,
  type SecurityStatus,
} from '../../app/%5Fdev/sdd/spec-805-data';
import { fr } from '../../messages/fr/sdd';
import { BaseCard } from '../sdd/base-tokens';

const t = fr.sdd.spec805;

function statusLabel(status: SecurityStatus): string {
  switch (status) {
    case 'verified':
      return t.statuses.verified;
    case 'failed':
      return t.statuses.failed;
    default:
      return t.statuses.notRun;
  }
}

function Category({ category }: Readonly<{ category: SecurityCategory }>) {
  return (
    <BaseCard testId={`spec-805-${category.key}`} title={category.title}>
      <div
        role="region"
        aria-label={category.title}
        tabIndex={0}
        className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <table className="w-full min-w-[28rem] text-left text-13">
          <thead>
            <tr>
              <th scope="col" className="px-3 py-2">
                {t.columns.control}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.columns.test}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.columns.status}
              </th>
            </tr>
          </thead>
          <tbody>
            {category.rows.map((row) => (
              <tr key={row.label} className="border-t border-border" data-testid="spec-805-row">
                <td className="px-3 py-2">{row.label}</td>
                <td className="px-3 py-2 font-mono" data-testid="spec-805-test">
                  {row.test}
                </td>
                <td className="px-3 py-2" data-testid="spec-805-status">
                  {statusLabel(row.status)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BaseCard>
  );
}

export default function Spec805Demo() {
  const categories = loadSpec805Report();
  return (
    <>
      <p className="mt-6 text-13 text-ink-secondary">{t.intro}</p>
      {categories.map((category) => (
        <Category key={category.key} category={category} />
      ))}
      <p className="mt-4 text-13 text-ink-secondary">{t.note}</p>
    </>
  );
}
