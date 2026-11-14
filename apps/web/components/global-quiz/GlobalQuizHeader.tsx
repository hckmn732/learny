import { fr } from '../../messages/fr';

const t = fr.globalQuiz;

export interface GlobalQuizHeaderProps {
  subtitle: string;
  notionCount: number;
  modulesLabel: string;
  estimatedMinutes: number;
}

/**
 * SCR-10 §10.1 — eyebrow, title and the three pills of the daily session (SPEC-701 EF-3). The pill
 * texts are computed by the service and shown as is: a session never recomputes its header.
 */
export function GlobalQuizHeader(props: GlobalQuizHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-16" data-testid="gq-header">
      <div className="flex flex-col gap-4">
        <p className="m-0 text-14 text-ink-muted">{props.subtitle}</p>
        <h1 className="m-0 font-display text-34 font-600 tracking-title text-ink">{t.title}</h1>
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-8 p-0 text-13 font-600">
        <li
          className="rounded-full border border-solid border-border bg-surface px-12 py-8"
          data-testid="gq-pill-notions"
        >
          {t.pills.notions(props.notionCount)}
        </li>
        <li
          className="rounded-full border border-solid border-border bg-surface px-12 py-8"
          data-testid="gq-pill-modules"
        >
          {props.modulesLabel}
        </li>
        <li
          aria-label={t.pills.durationLabel(props.estimatedMinutes)}
          className="rounded-full border border-solid border-border bg-surface px-12 py-8"
          data-testid="gq-pill-duration"
        >
          {t.pills.duration(props.estimatedMinutes)}
        </li>
      </ul>
    </header>
  );
}
