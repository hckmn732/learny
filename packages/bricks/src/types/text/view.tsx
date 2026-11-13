'use client';

import { resolveLabels } from '../../view/labels';
import { MarkdownContent } from '../../view/markdown';
import type { BrickViewProps } from '../../view-types';

/** Course text rendered from sanitised Markdown (SPEC-503 EF-11). */
export function TextView({ brick, labels }: BrickViewProps<'text'>) {
  const t = resolveLabels(labels);
  const payload = brick.publicPayload;
  return (
    <article
      className="flex flex-col gap-16 text-ink"
      data-testid="brick-text"
      data-variant="course"
    >
      <h2 className="m-0 font-display text-34 font-600 leading-1.2 tracking-title">
        {payload.title}
      </h2>
      <MarkdownContent markdown={payload.bodyMd} />
      {payload.sources.length > 0 ? (
        <p className="m-0 text-12 text-ink-muted">
          {`${t.sourcePrefix}${String(payload.sources.length)}`}
        </p>
      ) : null}
    </article>
  );
}
