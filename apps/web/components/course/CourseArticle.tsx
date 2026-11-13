'use client';

import { useState, type ReactNode } from 'react';

import { MarkdownContent } from '@learny/bricks/view';
import type { CourseSection } from '@learny/contracts';

import { fr } from '../../messages/fr';

import { QuickQuestion } from './QuickQuestion';
import { SourceLink } from './SourceLink';

const t = fr.course;

function Citations({ section }: { section: CourseSection }) {
  if (section.citations.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-8">
      {section.citations.map((citation) => (
        <SourceLink citation={citation} key={citation.id} />
      ))}
    </div>
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
      id={section.anchor}
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
      id={section.anchor}
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

export interface SectionActions {
  onReport: (sectionId: string, reason: string) => Promise<{ ok: boolean; conflict?: boolean }>;
  onEdit: (
    sectionId: string,
    expectedVersion: number,
    contentMd: string,
  ) => Promise<{ ok: boolean; conflict?: boolean }>;
}

function EditableMarkdown({
  section,
  actions,
}: {
  section: CourseSection;
  actions: SectionActions;
}): ReactNode {
  const [mode, setMode] = useState<'idle' | 'report' | 'edit'>('idle');
  const [reason, setReason] = useState('');
  const [content, setContent] = useState(section.contentMd ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitReport = () => {
    if (reason.trim() === '') return;
    setBusy(true);
    setError(null);
    void actions.onReport(section.id, reason.trim()).then((result) => {
      setBusy(false);
      if (result.ok) {
        setMode('idle');
        setReason('');
      } else {
        setError(t.reportedError);
      }
    });
  };

  const submitEdit = () => {
    setBusy(true);
    setError(null);
    void actions.onEdit(section.id, section.version, content).then((result) => {
      setBusy(false);
      if (result.ok) {
        setMode('idle');
      } else {
        setError(result.conflict ? t.editConflict : t.editError);
      }
    });
  };

  return (
    <section className="flex flex-col gap-10" id={section.anchor}>
      {section.reported ? (
        <p
          className="m-0 rounded-14 bg-orange-soft p-12 text-13 font-600 text-orange-ink-strong"
          data-testid="course-section-reported"
          role="status"
        >
          {t.reportedNotice}
        </p>
      ) : null}
      {section.contentMd === null ? null : (
        <div data-testid="course-markdown">
          <MarkdownContent markdown={section.contentMd} />
        </div>
      )}
      <Citations section={section} />
      {mode === 'report' ? (
        <div className="flex flex-col gap-8 rounded-16 border border-border p-12">
          <label className="text-13 font-600" htmlFor={`${section.id}-motif`}>
            {t.reportReason}
          </label>
          <textarea
            className="min-h-72 rounded-12 border border-border-strong p-10 text-14"
            data-testid="course-section-reason"
            id={`${section.id}-motif`}
            onChange={(event) => {
              setReason(event.target.value);
            }}
            value={reason}
          />
          <div className="flex flex-wrap gap-8">
            <button
              className="min-h-40 cursor-pointer rounded-10 bg-ink px-12 text-13 font-700 text-white disabled:opacity-60"
              data-testid="course-section-report-submit"
              disabled={busy}
              onClick={submitReport}
              type="button"
            >
              {t.reportSubmit}
            </button>
            <button
              className="min-h-40 cursor-pointer rounded-10 border border-border px-12 text-13"
              onClick={() => {
                setMode('idle');
              }}
              type="button"
            >
              {t.reportCancel}
            </button>
          </div>
        </div>
      ) : mode === 'edit' ? (
        <div className="flex flex-col gap-8 rounded-16 border border-border p-12">
          <label className="text-13 font-600" htmlFor={`${section.id}-contenu`}>
            {t.editContent}
          </label>
          <textarea
            className="min-h-120 rounded-12 border border-border-strong p-10 text-14"
            data-testid="course-section-content"
            id={`${section.id}-contenu`}
            onChange={(event) => {
              setContent(event.target.value);
            }}
            value={content}
          />
          <div className="flex flex-wrap gap-8">
            <button
              className="min-h-40 cursor-pointer rounded-10 bg-ink px-12 text-13 font-700 text-white disabled:opacity-60"
              data-testid="course-section-save"
              disabled={busy}
              onClick={submitEdit}
              type="button"
            >
              {t.editSubmit}
            </button>
            <button
              className="min-h-40 cursor-pointer rounded-10 border border-border px-12 text-13"
              onClick={() => {
                setMode('idle');
              }}
              type="button"
            >
              {t.editCancel}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-10 text-12 text-ink-muted">
          <button
            className="cursor-pointer underline"
            data-testid="course-section-report"
            onClick={() => {
              setMode('report');
            }}
            type="button"
          >
            {t.reportAction}
          </button>
          <button
            className="cursor-pointer underline"
            data-testid="course-section-edit"
            onClick={() => {
              setMode('edit');
            }}
            type="button"
          >
            {t.editAction}
          </button>
          <span>{t.editVersion(section.version)}</span>
        </div>
      )}
      {error === null ? null : (
        <p className="m-0 text-13 text-orange-ink-strong" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** BR-COU-02 to BR-COU-06, BR-COU-09 — the safe Markdown article of one chapter. */
export function CourseArticle({
  sections,
  actions,
}: {
  sections: readonly CourseSection[];
  actions?: SectionActions;
}) {
  return (
    <>
      {sections.map((section) => {
        if (section.kind === 'flash_question') return <QuickQuestion key={section.id} section={section} />;
        if (section.kind === 'dont_confuse') return <Comparison key={section.id} section={section} />;
        if (section.kind === 'retain') return <Takeaway key={section.id} section={section} />;
        if (section.kind === 'summary_prompt') return null;
        if (section.kind === 'tutor_completed') {
          return (
            <section
              className="flex flex-col gap-8 rounded-20 border-[1.5px] border-dashed border-border-strong p-18"
              data-testid="course-tutor-complement"
              id={section.anchor}
              key={section.id}
            >
              <span className="self-start rounded-full bg-surface-muted px-10 py-4 text-12 font-700">
                {t.tutorCompleted}
              </span>
              {section.contentMd === null ? null : <MarkdownContent markdown={section.contentMd} />}
              <Citations section={section} />
            </section>
          );
        }
        return (
          <EditableMarkdown
            actions={
              actions ?? {
                onReport: () => Promise.resolve({ ok: true }),
                onEdit: () => Promise.resolve({ ok: true }),
              }
            }
            key={section.id}
            section={section}
          />
        );
      })}
    </>
  );
}
