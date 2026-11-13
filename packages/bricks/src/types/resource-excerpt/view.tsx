'use client';

import { ExcerptChip, type ExcerptKind } from '../../view/excerpt-chip';
import { resolveLabels } from '../../view/labels';
import type { BrickViewProps } from '../../view-types';

function kindOf(label: string, hasStart: boolean): ExcerptKind {
  const lower = label.toLowerCase();
  if (lower.includes('note vocale') || lower.includes('audio')) return 'audio';
  if (lower.includes('youtube')) return 'youtube';
  if (lower.includes('vidéo') || lower.includes('video') || hasStart) return 'video';
  if (lower.includes('web') || lower.includes('lien')) return 'web';
  if (lower.includes('image') || lower.includes('photo')) return 'image';
  if (lower.includes('note')) return 'note';
  return 'pdf';
}

/** Cited passage with its clickable resource chip (SPEC-503 EF-12, ADR-0039). */
export function ResourceExcerptView({
  brick,
  onExcerptOpen,
  availableResourceIds,
  labels,
}: BrickViewProps<'resource_excerpt'>) {
  const t = resolveLabels(labels);
  const payload = brick.publicPayload;
  const available =
    availableResourceIds === undefined || availableResourceIds.includes(payload.resourceId);
  const kind = kindOf(payload.label, payload.location.startSec !== undefined);
  const location =
    kind === 'youtube' && payload.location.startSec === undefined
      ? { ...payload.location, startSec: 0 }
      : payload.location;

  return (
    <figure
      className="m-0 flex flex-col gap-10 rounded-18 border border-solid border-border bg-surface-subtle p-16"
      data-testid="brick-resource_excerpt"
    >
      <blockquote className="m-0 border-l-4 border-solid border-lime pl-14 text-17 leading-1.7 text-ink">
        {payload.quote}
      </blockquote>
      <figcaption className="flex flex-wrap items-center gap-8 text-13 text-ink-muted">
        <ExcerptChip
          deleted={!available}
          kind={kind}
          label={payload.label}
          labels={labels}
          onOpen={
            available
              ? () => {
                  onExcerptOpen?.({ resourceId: payload.resourceId, location });
                }
              : undefined
          }
        />
        {!available ? <span>{t.excerptDeleted}</span> : null}
      </figcaption>
    </figure>
  );
}
