import {
  loadSpec711Demo,
  type Spec711Data,
  type Spec711JournalRow,
  type Spec711KeyRow,
  type Spec711Step,
} from '../../app/%5Fdev/sdd/spec-711-data';
import { fr } from '../../messages/fr';
import { BaseCard, BaseTokenStyle } from '../sdd/base-tokens';

const t = fr.sdd.spec711;

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  dateStyle: 'short',
  timeStyle: 'short',
});

function instant(value: string): string {
  return value === '' ? '—' : dateFormatter.format(new Date(value));
}

function keyLabel(key: string): string {
  const labels: Record<string, string> = t.registry.keys;
  return labels[key] ?? key;
}

function Registry({ keys }: Readonly<{ keys: Spec711KeyRow[] }>) {
  return (
    <BaseCard testId="automation-registry" title={t.registry.title}>
      <p className="m-0 text-13 text-ink-secondary">{t.registry.intro}</p>
      <div
        role="region"
        aria-label={t.registry.region}
        tabIndex={0}
        className="mt-4 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <table className="w-full min-w-[52rem] text-left text-13">
          <thead>
            <tr>
              <th scope="col" className="px-3 py-2">
                {t.registry.key}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.registry.label}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.registry.triggers}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.registry.params}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.registry.explanation}
              </th>
            </tr>
          </thead>
          <tbody>
            {keys.map((row) => (
              <tr key={row.key} data-testid="automation-key" className="border-t border-border">
                <td className="px-3 py-2 font-mono" data-testid="automation-key-name">
                  {row.key}
                </td>
                <td className="px-3 py-2">{keyLabel(row.key)}</td>
                <td className="px-3 py-2 font-mono">{row.triggers}</td>
                <td className="px-3 py-2 font-mono">{row.params}</td>
                <td className="px-3 py-2">
                  <span data-testid="automation-key-registered">
                    {row.registered ? t.registry.registered : t.registry.notRegistered}
                  </span>
                  {row.registered ? ` · ${row.explanation}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BaseCard>
  );
}

function stepLabel(step: Spec711Step): string {
  switch (step.label) {
    case 'proposed':
      return t.state.proposed;
    case 'duplicate':
      return t.state.duplicate;
    case 'accept':
      return t.state.accept;
    case 'concurrent':
      return t.state.concurrent;
    case 'consumed':
      return t.state.consumed;
    case 'undo':
      return t.state.undo;
    case 'foreign':
      return t.state.foreign;
    default:
      return step.label;
  }
}

function resultLabel(step: Spec711Step): string {
  switch (step.result) {
    case 'created':
      return t.state.outcomes.created;
    case 'duplicateIgnored':
      return t.state.outcomes.duplicateIgnored;
    case 'appliedOnce':
      return t.state.outcomes.appliedOnce;
    case 'noSecondEffect':
      return t.state.outcomes.noSecondEffect;
    case 'consumed':
      return t.state.outcomes.consumed;
    case 'undoRefused':
      return t.state.outcomes.undoRefused(step.code ?? '');
    case 'foreignRefused':
      return t.state.outcomes.foreignRefused(step.code ?? '');
    default:
      return step.result;
  }
}

function State({ data }: Readonly<{ data: Spec711Data }>) {
  return (
    <BaseCard testId="automation-state" title={t.state.title}>
      <p className="m-0 text-13 text-ink-secondary">{t.state.intro}</p>
      <p className="m-0 mt-2 text-13" data-testid="automation-effect-count">
        {t.state.outcomes.effectCount(data.effectCount)}
      </p>
      <div
        role="region"
        aria-label={t.state.region}
        tabIndex={0}
        className="mt-4 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <table className="w-full min-w-[36rem] text-left text-13">
          <thead>
            <tr>
              <th scope="col" className="px-3 py-2">
                {t.state.step}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.state.result}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.steps.map((step) => (
              <tr key={step.label} data-testid="automation-step" className="border-t border-border">
                <td className="px-3 py-2">{stepLabel(step)}</td>
                <td className="px-3 py-2 font-mono" data-testid="automation-step-result">
                  {resultLabel(step)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.refusalTitle === '' ? null : (
        <p role="alert" className="m-0 mt-3 text-13" data-testid="automation-refusal">
          <span className="font-semibold">
            {t.state.errorTitle} : {data.refusalTitle}
          </span>{' '}
          {data.refusalMessage}
        </p>
      )}
    </BaseCard>
  );
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = t.state.statuses;
  return labels[status] ?? status;
}

function JournalRow({ row }: Readonly<{ row: Spec711JournalRow }>) {
  return (
    <tr data-testid="automation-journal-row" className="border-t border-border">
      <td className="px-3 py-2 font-mono" data-testid="automation-journal-date">
        {instant(row.createdAt)}
      </td>
      <td className="px-3 py-2" data-testid="automation-journal-automation">
        {keyLabel(row.automation)}
      </td>
      <td className="px-3 py-2 font-mono" data-testid="automation-journal-status">
        {statusLabel(row.status)}
      </td>
      <td className="px-3 py-2" data-testid="automation-journal-summary">
        {row.summary}
      </td>
      <td className="px-3 py-2">
        {row.canUndo ? (
          <button
            type="button"
            className="rounded-[8px] border border-solid border-border px-3 py-1"
          >
            {t.journal.undo}
          </button>
        ) : (
          <span className="text-ink-secondary" data-testid="automation-journal-no-undo">
            {t.journal.undoUnavailable}
          </span>
        )}
      </td>
    </tr>
  );
}

function Journal({ data }: Readonly<{ data: Spec711Data }>) {
  return (
    <BaseCard testId="automation-journal" title={t.journal.title}>
      <p className="m-0 text-13 text-ink-secondary">{t.journal.intro}</p>
      <p className="m-0 mt-2 font-semibold text-13" data-testid="automation-week-count">
        {t.journal.counter(data.weekCount)}
      </p>
      {data.journal.length === 0 ? (
        <p className="mt-3 text-13">{t.journal.empty}</p>
      ) : (
        <div
          role="region"
          aria-label={t.journal.title}
          tabIndex={0}
          className="relative mt-4 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <table className="w-full min-w-[48rem] text-left text-13">
            <thead>
              <tr>
                <th scope="col" className="px-3 py-2">
                  {t.journal.date}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t.journal.automation}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t.journal.status}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t.journal.summary}
                </th>
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">{t.journal.undo}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.journal.map((row) => (
                <JournalRow key={row.createdAt + row.automation} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </BaseCard>
  );
}

export default async function Spec711Demo() {
  let data: Spec711Data;
  try {
    data = await loadSpec711Demo();
  } catch {
    return (
      <div className="mt-6">
        <p role="alert">Démonstration indisponible : base locale injoignable.</p>
      </div>
    );
  }
  return (
    <>
      <BaseTokenStyle />
      <p className="mt-6 text-13 text-ink-secondary">{t.intro}</p>
      <Registry keys={data.keys} />
      <State data={data} />
      <Journal data={data} />
    </>
  );
}
