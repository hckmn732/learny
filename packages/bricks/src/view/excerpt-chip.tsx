import { cn } from '@learny/ui';

import { resolveLabels, type BrickViewLabelsOverride } from './labels';

export type ExcerptKind = 'pdf' | 'audio' | 'video' | 'youtube' | 'web' | 'note' | 'image';

const STYLES: Record<ExcerptKind, string> = {
  pdf: 'bg-excerpt-pdf-soft text-excerpt-pdf',
  audio: 'bg-excerpt-audio-soft text-excerpt-audio',
  video: 'bg-excerpt-video-soft text-excerpt-video',
  youtube: 'bg-excerpt-youtube-soft text-excerpt-youtube',
  web: 'bg-excerpt-web-soft text-excerpt-web',
  note: 'bg-excerpt-note-soft text-excerpt-note',
  image: 'bg-excerpt-image-soft text-excerpt-image',
};

export interface ExcerptChipProps {
  label: string;
  kind: ExcerptKind;
  onOpen?: (() => void) | undefined;
  deleted?: boolean | undefined;
  labels?: BrickViewLabelsOverride | undefined;
}

/** Inline resource excerpt of a course or a text (SPEC-503 EF-12, ADR-0152). */
export function ExcerptChip({ label, kind, onOpen, deleted = false, labels }: ExcerptChipProps) {
  const t = resolveLabels(labels);
  if (deleted || !onOpen) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-6 rounded-8 px-9 py-3 align-middle text-12 font-700',
          deleted ? 'bg-canvas text-ink-muted' : STYLES[kind],
        )}
        data-testid="brick-excerpt"
      >
        {deleted ? t.excerptDeleted : label}
      </span>
    );
  }
  return (
    <button
      className={cn(
        'inline-flex cursor-pointer items-center gap-6 rounded-8 border-0 px-9 py-3 align-middle text-12 font-700',
        STYLES[kind],
      )}
      data-testid="brick-excerpt"
      onClick={onOpen}
      type="button"
    >
      {label}
    </button>
  );
}
