'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import type { CourseCitation, CourseSection, ModuleCourseScreen } from '@learny/contracts';

import { api } from '../../lib/api-client';
import { fr } from '../../messages/fr';

const t = fr.course;

function messageOf(cause: unknown): string {
  return cause instanceof Error && cause.message !== '' ? cause.message : fr.module.errors.generic;
}

function chapterHref(screen: ModuleCourseScreen, chapterId: string): string {
  return `/formations/${encodeURIComponent(screen.formation.id)}/modules/${encodeURIComponent(
    screen.module.id,
  )}/cours?chapitre=${encodeURIComponent(chapterId)}`;
}

/** Safe, dependency-free Markdown subset: headings, lists, tables, bold and inline code. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    nodes.push(
      token.startsWith('**') ? (
        <strong key={`${keyPrefix}-${String(index)}`}>{token.slice(2, -2)}</strong>
      ) : (
        <code
          key={`${keyPrefix}-${String(index)}`}
          className="rounded-6 bg-surface-muted px-4 py-1"
        >
          {token.slice(1, -1)}
        </code>
      ),
    );
    last = match.index + token.length;
    index += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Markdown({ text, testId }: { text: string; testId?: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let table: string[][] = [];
  const flushList = () => {
    if (list.length === 0) return;
    blocks.push(
      <ul className="flex flex-col gap-8 pl-18" key={`list-${String(blocks.length)}`}>
        {list.map((item, index) => (
          <li className="text-16 leading-1.7" key={`item-${String(index)}`}>
            {inline(item, `li-${String(index)}`)}
          </li>
        ))}
      </ul>,
    );
    list = [];
  };
  const flushTable = () => {
    if (table.length === 0) return;
    const [head, ...rows] = table;
    blocks.push(
      <div
        className="overflow-x-auto rounded-18 border border-border"
        key={`table-${String(blocks.length)}`}
      >
        <table className="w-full border-collapse text-15">
          <thead>
            <tr className="bg-surface-muted text-left">
              {(head ?? []).map((cell, index) => (
                <th className="px-14 py-10 font-700" key={`th-${String(index)}`} scope="col">
                  {inline(cell, `th-${String(index)}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr className="border-t border-border" key={`tr-${String(rowIndex)}`}>
                {row.map((cell, cellIndex) => (
                  <td className="px-14 py-10" key={`td-${String(cellIndex)}`}>
                    {inline(cell, `td-${String(rowIndex)}-${String(cellIndex)}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    table = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('|')) {
      flushList();
      const cells = line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim());
      if (!cells.every((cell) => /^-+$/.test(cell))) table.push(cells);
      continue;
    }
    if (line.startsWith('- ')) {
      flushTable();
      list.push(line.slice(2));
      continue;
    }
    flushList();
    flushTable();
    if (line.trim() === '') continue;
    if (line.startsWith('### ')) {
      blocks.push(
        <h3 className="m-0 font-display text-20 font-600" key={`h3-${String(blocks.length)}`}>
          {inline(line.slice(4), `h3-${String(blocks.length)}`)}
        </h3>,
      );
    } else if (line.startsWith('## ')) {
      blocks.push(
        <h2 className="m-0 font-display text-24 font-600" key={`h2-${String(blocks.length)}`}>
          {inline(line.slice(3), `h2-${String(blocks.length)}`)}
        </h2>,
      );
    } else {
      blocks.push(
        <p className="m-0 text-16 leading-1.7" key={`p-${String(blocks.length)}`}>
          {inline(line, `p-${String(blocks.length)}`)}
        </p>,
      );
    }
  }
  flushList();
  flushTable();
  return (
    <div className="flex flex-col gap-14" data-testid={testId}>
      {blocks}
    </div>
  );
}

function sourceLabel(citation: CourseCitation): string {
  if (citation.deleted) return `${citation.label} · ${t.citationDeleted}`;
  const location = citation.location ?? {};
  if (typeof location.page === 'number') return t.sourcePage(citation.label, location.page);
  if (typeof location.startSec === 'number') {
    const total = Math.floor(location.startSec);
    const minute = `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')}`;
    return t.sourceMinute(citation.label, minute);
  }
  if (typeof location.anchor === 'string') return t.sourceAnchor(citation.label);
  if (citation.mediaKind === 'note') return t.sourceNote(citation.label);
  if (citation.mediaKind === 'image') return t.sourceImage(citation.label);
  return t.sourceWeb(citation.label);
}

function Citations({ citations }: { citations: readonly CourseCitation[] }) {
  if (citations.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-8">
      {citations.map((citation) => (
        <span
          className={
            citation.deleted
              ? 'inline-flex items-center gap-6 rounded-8 bg-orange-soft px-10 py-4 text-12 font-700 text-orange-ink-strong'
              : 'inline-flex items-center gap-6 rounded-8 bg-indigo-soft px-10 py-4 text-12 font-700 text-indigo-ink'
          }
          data-testid="course-citation"
          key={citation.id}
        >
          {sourceLabel(citation)}
        </span>
      ))}
    </div>
  );
}

function QuickQuestion({ section }: { section: CourseSection }) {
  const [shown, setShown] = useState(false);
  const data = section.data ?? {};
  const question = typeof data.question === 'string' ? data.question : '';
  const answer = typeof data.answer === 'string' ? data.answer : '';
  return (
    <section
      aria-labelledby={`${section.anchor}-titre`}
      className="flex flex-col gap-12 rounded-22 bg-indigo-soft p-22"
      data-testid="course-quick-question"
    >
      <h2
        className="m-0 text-12 font-700 tracking-wide text-indigo-ink-strong uppercase"
        id={`${section.anchor}-titre`}
      >
        {t.quickQuestion}
      </h2>
      <p className="m-0 font-display text-20 font-600 text-ink">{question}</p>
      {shown ? (
        <p className="m-0 rounded-14 bg-surface p-12 text-15" data-testid="course-answer">
          {answer}
        </p>
      ) : null}
      <button
        className="inline-flex min-h-44 w-fit cursor-pointer items-center rounded-12 bg-ink px-18 text-14 font-700 text-white"
        data-testid="course-reveal"
        onClick={() => {
          setShown((value) => !value);
        }}
        type="button"
      >
        {shown ? t.hide : t.reveal}
      </button>
    </section>
  );
}

function Comparison({ section }: { section: CourseSection }) {
  const data = section.data ?? {};
  const sides = [data.left, data.right].map((value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {},
  );
  return (
    <section
      aria-labelledby={`${section.anchor}-titre`}
      className="flex flex-col gap-12"
      data-testid="course-confusion"
    >
      <h2
        className="m-0 text-12 font-700 tracking-wide text-orange-ink-strong uppercase"
        id={`${section.anchor}-titre`}
      >
        {t.comparison}
      </h2>
      <div className="flex flex-wrap items-stretch gap-12">
        {sides.map((side, index) => (
          <div
            className="flex flex-1 basis-220 flex-col gap-6 rounded-20 bg-orange-soft p-20"
            key={`side-${String(index)}`}
          >
            <span className="font-display text-20 font-600">
              {typeof side.title === 'string' ? side.title : ''}
            </span>
            <span className="text-15">{typeof side.body === 'string' ? side.body : ''}</span>
            <span className="text-14 text-orange-ink-strong">
              {typeof side.example === 'string' ? side.example : ''}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Takeaway({ section }: { section: CourseSection }) {
  const data = section.data ?? {};
  const points = Array.isArray(data.points)
    ? data.points.filter((point): point is string => typeof point === 'string')
    : [];
  const diagram =
    data.diagram !== null && typeof data.diagram === 'object' && !Array.isArray(data.diagram)
      ? (data.diagram as Record<string, unknown>)
      : null;
  const blocks = Array.isArray(diagram?.blocks)
    ? diagram.blocks.filter(
        (block): block is { id: string; label: string } =>
          block !== null &&
          typeof block === 'object' &&
          typeof (block as Record<string, unknown>).id === 'string' &&
          typeof (block as Record<string, unknown>).label === 'string',
      )
    : [];
  const mnemonic = typeof data.mnemonic === 'string' ? data.mnemonic : null;
  return (
    <section
      aria-labelledby={`${section.anchor}-titre`}
      className="mt-4 flex flex-col gap-16 rounded-26 bg-ink p-26 text-white"
      data-testid="course-takeaway"
    >
      <h2 className="m-0 font-display text-26 font-600" id={`${section.anchor}-titre`}>
        {t.takeaway}
      </h2>
      <ul className="m-0 flex list-none flex-col gap-10 p-0 text-15">
        {points.map((point, index) => (
          <li className="flex gap-10" key={`point-${String(index)}`}>
            <span
              aria-hidden="true"
              className="mt-2 inline-flex h-22 w-22 flex-none items-center justify-center rounded-7 bg-lime text-12 font-700 text-ink"
            >
              ✓
            </span>
            <span>{point}</span>
          </li>
        ))}
      </ul>
      {blocks.length > 0 ? (
        <div
          aria-label="Schéma du chapitre"
          className="flex flex-col items-center gap-10 rounded-20 bg-dark-800 p-18"
          role="img"
        >
          <div className="flex flex-wrap justify-center gap-10">
            {blocks.map((block) => (
              <span
                className="rounded-12 border border-border-strong px-14 py-10 text-14"
                key={block.id}
              >
                {block.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {mnemonic === null ? null : (
        <p className="m-0 rounded-16 bg-lime p-14 text-15 text-ink">
          <strong>{t.mnemonic} :</strong> {mnemonic}
        </p>
      )}
    </section>
  );
}

function SummaryPrompt({ section }: { section: CourseSection }) {
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <section className="flex flex-col gap-10" data-testid="course-summary">
      <h2 className="m-0 font-display text-22 font-600">{t.summaryTitle}</h2>
      <p className="m-0 text-15 text-ink-muted">{t.summaryIntro}</p>
      <label className="sr-only" htmlFor={`${section.anchor}-resume`}>
        {t.summaryTitle}
      </label>
      <textarea
        className="min-h-96 rounded-16 border border-border-strong bg-surface p-14 text-15"
        id={`${section.anchor}-resume`}
        rows={3}
      />
      <button
        className="inline-flex min-h-44 w-fit cursor-pointer items-center rounded-12 bg-ink px-18 text-14 font-700 text-white"
        onClick={() => {
          setNotice(t.summaryUnavailable);
        }}
        type="button"
      >
        {t.summaryAction}
      </button>
      {notice === null ? null : (
        <p className="m-0 text-13 text-ink-muted" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}

function Section({ section }: { section: CourseSection }) {
  if (section.kind === 'flash_question') return <QuickQuestion section={section} />;
  if (section.kind === 'dont_confuse') return <Comparison section={section} />;
  if (section.kind === 'retain') return <Takeaway section={section} />;
  if (section.kind === 'summary_prompt') return <SummaryPrompt section={section} />;
  if (section.kind === 'tutor_completed') {
    return (
      <section
        className="flex flex-col gap-8 rounded-20 border-[1.5px] border-dashed border-border-strong p-18"
        data-testid="course-tutor-complement"
      >
        <span className="self-start rounded-full bg-surface-muted px-10 py-4 text-12 font-700">
          {t.tutorCompleted}
        </span>
        {section.contentMd === null ? null : <Markdown text={section.contentMd} />}
        <Citations citations={section.citations} />
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-10">
      {section.contentMd === null ? null : (
        <Markdown text={section.contentMd} testId="course-markdown" />
      )}
      <Citations citations={section.citations} />
    </section>
  );
}

export function CourseScreen({ initial }: { initial: ModuleCourseScreen }) {
  const query = useQuery({
    queryKey: ['module-course', initial.module.id, initial.selectedChapterId],
    queryFn: () =>
      api.moduleCourse({
        params: { mid: initial.module.id },
        query: { chapitre: initial.selectedChapterId },
      }),
    initialData: initial,
    refetchInterval: (current) => {
      const data = current.state.data;
      return data?.course === null && data.generation.status === 'generating' ? 3000 : false;
    },
  });
  const screen = query.data;
  const course = screen.course;

  return (
    <main className="mx-auto w-full px-16 pb-40 shell:px-40" data-testid="course-page">
      <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-20">
        <div className="flex flex-wrap items-center justify-between gap-12">
          <nav aria-label="Fil d’Ariane" className="text-14 text-ink-muted">
            <a
              className="underline"
              href={`/formations/${encodeURIComponent(screen.formation.id)}/programme`}
            >
              Programme
            </a>{' '}
            /{' '}
            <a
              className="underline"
              href={`/formations/${encodeURIComponent(screen.formation.id)}/modules/${encodeURIComponent(screen.module.id)}`}
            >
              Module {screen.module.position} · {screen.module.title}
            </a>{' '}
            / {t.breadcrumbCours}
          </nav>
          {course === null ? null : (
            <div className="flex min-w-240 items-center gap-10">
              <div
                aria-hidden="true"
                className="h-6 flex-1 rounded-3 bg-border"
                data-testid="course-progress"
              >
                <div
                  className="h-6 rounded-3 bg-ink"
                  style={{
                    width: `${String(
                      Math.round(
                        ((course.chapter.position - 1) / Math.max(1, screen.chapters.length)) * 100,
                      ),
                    )}%`,
                  }}
                />
              </div>
              <span className="text-13 font-600">
                {t.chapterBadge(course.chapter.position, screen.chapters.length)}
              </span>
            </div>
          )}
        </div>

        {course === null ? (
          <section
            className="flex flex-col gap-12 rounded-24 border border-border bg-surface p-28"
            data-testid="course-state"
          >
            <h1 className="m-0 font-display text-30 font-600 tracking-title">
              {screen.generation.status === 'generating'
                ? t.loadingTitle
                : screen.generation.status === 'failed'
                  ? t.failedTitle
                  : t.emptyTitle}
            </h1>
            <p className="m-0 text-15 text-ink-muted" role="status">
              {screen.generation.status === 'generating'
                ? t.loadingText
                : screen.generation.status === 'failed'
                  ? (screen.generation.error ?? t.failedText)
                  : t.emptyText}
            </p>
            {screen.generation.status === 'failed' ? (
              <p className="m-0 text-14 text-ink-muted">{t.failedText}</p>
            ) : null}
          </section>
        ) : (
          <div className="flex flex-wrap items-start gap-20">
            <nav
              aria-label={t.sommaire}
              className="flex flex-1 basis-220 flex-col gap-4 rounded-24 border border-border bg-surface p-14"
              data-testid="course-summary-nav"
            >
              <p className="m-0 px-8 py-8 text-11 font-700 tracking-wide text-ink-muted uppercase">
                {t.sommaire}
              </p>
              {screen.chapters.map((chapter) => {
                const active = chapter.id === screen.selectedChapterId;
                return (
                  <a
                    aria-current={active ? 'page' : undefined}
                    className={
                      active
                        ? 'flex min-h-48 items-center gap-10 rounded-14 bg-surface-muted px-10 py-8 text-14 font-700 text-ink'
                        : 'flex min-h-48 items-center gap-10 rounded-14 px-10 py-8 text-14 text-ink'
                    }
                    href={chapterHref(screen, chapter.id)}
                    key={chapter.id}
                  >
                    <span
                      aria-hidden="true"
                      className={
                        active
                          ? 'inline-flex h-24 w-24 flex-none items-center justify-center rounded-full bg-ink text-12 text-white'
                          : 'inline-flex h-24 w-24 flex-none items-center justify-center rounded-full border border-border-strong text-12 text-ink-muted'
                      }
                    >
                      {chapter.position}
                    </span>
                    {chapter.title}
                  </a>
                );
              })}
              {course.sections.map((section) => (
                <a
                  className="block py-6 pr-10 pl-44 text-13 text-ink-muted"
                  href={`#${section.anchor}`}
                  key={section.id}
                >
                  {section.title ??
                    (section.kind === 'retain'
                      ? t.takeaway
                      : section.kind === 'flash_question'
                        ? t.quickQuestion.split(' · ')[0]
                        : section.anchor.replaceAll('-', ' '))}
                </a>
              ))}
            </nav>

            <article
              className="flex min-w-0 flex-1 basis-560 flex-col gap-20 rounded-28 border border-border bg-surface p-28 shell:p-40"
              data-testid="course-article"
            >
              <div className="flex flex-col gap-14" data-testid="course-header">
                <div className="flex flex-wrap gap-8 text-12 font-700">
                  <span className="rounded-full bg-ink px-10 py-5 text-white">
                    {t.chapterBadge(course.chapter.position, screen.chapters.length)}
                  </span>
                  <span className="rounded-full bg-surface-muted px-10 py-5">
                    {course.readingMinutes} min {t.reading}
                  </span>
                  <span className="rounded-full bg-surface-muted px-10 py-5">
                    {course.baseCourse ? t.baseCourse : t.builtFrom(course.resourceCount)}
                  </span>
                </div>
                <h1
                  className="m-0 font-display text-34 font-600 tracking-title shell:text-40"
                  data-testid="course-title"
                >
                  {course.chapter.title}
                </h1>
                {course.baseCourse ? (
                  <div
                    className="flex flex-col gap-6 rounded-16 bg-orange-soft p-14 text-14 text-orange-ink-strong"
                    data-testid="course-base-notice"
                  >
                    <strong>{t.baseCourseTitle}</strong>
                    <span>{t.baseCourseText}</span>
                  </div>
                ) : null}
              </div>

              {course.sections.map((section) => (
                <Section key={section.id} section={section} />
              ))}

              {course.baseCourse ? (
                <section
                  className="flex flex-col gap-8 rounded-20 border border-border bg-surface-muted p-18"
                  data-testid="course-suggestions"
                >
                  <h2 className="m-0 font-display text-20 font-600">{t.suggestionsTitle}</h2>
                  <p className="m-0 text-14 text-ink-muted">{t.suggestionsIntro}</p>
                  <ul className="m-0 flex list-none flex-col gap-8 p-0">
                    {course.suggestions.map((suggestion) => (
                      <li className="rounded-14 bg-surface p-12" key={suggestion.id}>
                        <a className="text-14 font-700 underline" href={suggestion.url}>
                          {suggestion.title}
                        </a>
                        <p className="m-0 mt-4 text-13 text-ink-muted">{suggestion.reason}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <div className="flex flex-wrap justify-between gap-12 border-t border-border pt-16">
                {course.previousChapterId === null ? (
                  <span />
                ) : (
                  <a
                    className="inline-flex min-h-48 items-center rounded-14 border border-border-strong bg-surface px-18 text-14 font-600"
                    href={chapterHref(screen, course.previousChapterId)}
                  >
                    {t.previous}
                  </a>
                )}
                {course.nextChapterId === null ? null : (
                  <a
                    className="inline-flex min-h-48 items-center rounded-14 bg-ink px-18 text-14 font-700 text-white"
                    href={chapterHref(screen, course.nextChapterId)}
                  >
                    {t.next}
                  </a>
                )}
              </div>
            </article>
          </div>
        )}
        {query.error === null ? null : (
          <p
            className="m-0 rounded-14 bg-orange-soft p-12 text-14 text-orange-ink-strong"
            role="alert"
          >
            {messageOf(query.error)}
          </p>
        )}
      </div>
    </main>
  );
}
