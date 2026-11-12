import {
  loadSpec107Demo,
  type Spec107Data,
  type Spec107History,
} from '../../app/%5Fdev/sdd/spec-107-data';
import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

const t = fr.sdd.spec107;

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  dateStyle: 'short',
  timeStyle: 'short',
});

const numberFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

function instant(value: string | null): string {
  if (value === null) return t.due.missing;
  return dateFormatter.format(new Date(value));
}

function mastery(value: number): string {
  return `${numberFormatter.format(value)} %`;
}

function cardSummary(card: Spec107History['before']): string {
  if (card === null) return t.history.missing;
  const state = t.history.states[card.state];
  return `${t.history.card(card.reps, state)} · ${instant(card.due)}`;
}

function States({ data }: Readonly<{ data: Spec107Data }>) {
  const first = data.states[0];
  return (
    <DemoSection testId="spec-107-due" title={t.due.title}>
      <p className="mb-3 text-sm">{t.due.intro}</p>
      <p className="mb-3 font-mono text-sm" data-testid="due-count">
        {t.due.count(data.dueCount)}
      </p>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {data.states.map((card) => (
          <li
            key={card.notionId}
            data-testid="due-card"
            className="rounded-[8px] border border-solid border-border p-4"
          >
            <p className="font-semibold" data-testid="due-card-label">
              {card.label}
            </p>
            <dl className="mt-2 grid grid-cols-1 gap-1 text-sm">
              <dt>{t.due.due}</dt>
              <dd className="font-mono" data-testid="due-card-due">
                {instant(card.dueAt)}
              </dd>
              <dt>{t.due.mastery}</dt>
              <dd className="font-mono" data-testid="due-card-mastery">
                {mastery(card.mastery)}
              </dd>
              <dt>{t.due.status}</dt>
              <dd className="font-mono" data-testid="due-card-review">
                {card.inReview ? t.due.inReview : t.due.notInReview}
              </dd>
            </dl>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm" data-testid="spec-107-isolation">
        {t.due.isolation(data.isolation)}
      </p>
      {first === undefined ? null : (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm">{t.due.technical}</summary>
          <pre
            data-testid="due-fsrs"
            className="mt-2 overflow-x-auto rounded-[8px] border border-solid border-border p-3 text-xs"
          >
            {JSON.stringify(first.fsrs, null, 2)}
          </pre>
        </details>
      )}
    </DemoSection>
  );
}

function Gap({ data }: Readonly<{ data: Spec107Data }>) {
  return (
    <DemoSection testId="spec-107-gap" title={t.gap.title}>
      <p className="mb-3 text-sm">{t.gap.intro}</p>
      <p className="text-sm font-semibold">{t.gap.natures}</p>
      <ul className="mt-2 flex flex-wrap gap-2" aria-label={t.gap.natures}>
        {data.gap.natures.map((nature) => {
          const isActive = data.gap.active && data.gap.nature === nature;
          return (
            <li
              key={nature}
              data-testid="gap-nature-option"
              data-active={isActive ? 'true' : 'false'}
              className={`rounded-[8px] border border-solid border-border px-3 py-1 text-sm ${
                isActive ? 'font-semibold' : ''
              }`}
            >
              {t.gap.labels[nature]}
            </li>
          );
        })}
      </ul>
      {data.gap.active ? (
        <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <dt>{t.gap.active}</dt>
          <dd className="font-mono" data-testid="gap-state">
            {data.gap.nature === null ? t.due.missing : t.gap.labels[data.gap.nature]}
          </dd>
          <dt>{t.gap.confused}</dt>
          <dd className="font-mono" data-testid="gap-confused-with">
            {data.gap.confusedWithLabel ?? t.due.missing}
          </dd>
          <dt>{t.gap.detected}</dt>
          <dd className="font-mono" data-testid="gap-detected-at">
            {instant(data.gap.detectedAt)}
          </dd>
        </dl>
      ) : (
        <p className="mt-4 text-sm" data-testid="gap-none">
          {t.gap.none}
        </p>
      )}
      {data.gap.evidence === null ? null : (
        <div className="mt-4">
          <p className="text-sm font-semibold">{t.gap.evidence}</p>
          <pre
            data-testid="gap-evidence"
            className="mt-2 overflow-x-auto rounded-[8px] border border-solid border-border p-3 text-xs"
          >
            {JSON.stringify(data.gap.evidence, null, 2)}
          </pre>
        </div>
      )}
    </DemoSection>
  );
}

function History({ data }: Readonly<{ data: Spec107Data }>) {
  return (
    <DemoSection testId="spec-107-history" title={t.history.title}>
      <p className="mb-3 text-sm">{t.history.intro}</p>
      <div
        role="region"
        aria-label={t.history.title}
        tabIndex={0}
        className="overflow-x-auto rounded-[8px] border border-solid border-border"
      >
        <table className="w-full min-w-[44rem] text-left">
          <thead>
            <tr>
              <th scope="col" className="px-3 py-2">
                {t.history.date}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.history.source}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.history.grade}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.history.correct}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.history.time}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.history.before}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.history.after}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.history.map((log) => (
              <tr
                key={`${log.reviewedAt}-${log.grade}`}
                data-testid="history-row"
                className="border-t border-border"
              >
                <td className="px-3 py-2 font-mono text-sm" data-testid="history-date">
                  {instant(log.reviewedAt)}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="history-source">
                  {log.source}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="history-grade">
                  {log.grade}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="history-correct">
                  {log.correct === null
                    ? t.history.missing
                    : log.correct
                      ? t.history.yes
                      : t.history.non}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="history-time">
                  {log.timeMs === null ? t.history.missing : t.history.seconds(log.timeMs)}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="history-before">
                  {cardSummary(log.before)}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="history-after">
                  {cardSummary(log.after)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DemoSection>
  );
}

export default async function Spec107Demo() {
  let data: Spec107Data;
  try {
    data = await loadSpec107Demo();
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
      <States data={data} />
      <Gap data={data} />
      <History data={data} />
    </>
  );
}
