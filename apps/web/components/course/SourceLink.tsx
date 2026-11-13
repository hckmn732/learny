'use client';

import type { CourseCitation } from '@learny/contracts';

import { api } from '../../lib/api-client';
import { fr } from '../../messages/fr';

const t = fr.course;

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

/**
 * SPEC-609 EF-2, ET-3, CL-3 — controlled citation chip. It carries a passage identifier, never a
 * model-produced URL. Clicking resolves the owner's source and opens it at its page or minute; a
 * deleted source is a plain label and never requests a signed URL.
 */
export function SourceLink({ citation }: { citation: CourseCitation }) {
  const label = sourceLabel(citation);
  if (citation.deleted) {
    return (
      <span
        className="inline-flex items-center gap-6 rounded-8 bg-orange-soft px-10 py-4 text-12 font-700 text-orange-ink-strong"
        data-testid="course-source"
      >
        {label}
      </span>
    );
  }
  return (
    <button
      className="inline-flex cursor-pointer items-center gap-6 rounded-8 bg-orange-soft px-10 py-4 text-12 font-700 text-orange-ink-strong"
      data-testid="course-source"
      onClick={() => {
        // Opened synchronously so the browser keeps the user gesture, then navigated once the
        // short signed URL is known. The blank tab is closed when no readable source exists.
        const opened = window.open('about:blank', '_blank', 'noopener');
        void api
          .courseCitationSource({ params: { cid: citation.id } })
          .then((source) => {
            if (opened === null) return;
            if (source.url === null) {
              opened.close();
              return;
            }
            opened.location.href = source.url;
          })
          .catch(() => {
            opened?.close();
          });
      }}
      type="button"
    >
      {label}
    </button>
  );
}
