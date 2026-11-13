import type { QuizResultDto } from '@learny/contracts';

import { fr } from '../../messages/fr';

const t = fr.quiz;

export function MasteredNotions({ result }: { result: QuizResultDto }) {
  return (
    <section
      aria-labelledby="t-acquis"
      className="flex flex-col gap-10 rounded-[22px] border border-border bg-surface p-20"
      data-testid="result-mastered"
    >
      <h2 className="m-0 text-15 font-700" id="t-acquis">
        {t.resultMasteredTitle(result.mastered.length)}
      </h2>
      <ul className="m-0 flex list-none flex-wrap gap-6 p-0 text-13 font-600">
        {result.mastered.map((notion) => (
          <li
            className="rounded-full bg-indigo-soft px-12 py-6 text-indigo-ink-strong"
            key={notion.notionId}
          >
            {notion.label}
          </li>
        ))}
      </ul>
      <details className="group">
        <summary className="cursor-pointer text-14 font-600 text-ink-muted">
          {t.resultPerNotion}
        </summary>
        <ul className="mt-8 flex list-none flex-col gap-4 p-0 text-14">
          {result.perNotion.map((notion) => (
            <li key={notion.notionId}>
              {t.resultPerNotionLine(
                notion.label,
                notion.correct,
                notion.total,
                Math.round(notion.score),
              )}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
