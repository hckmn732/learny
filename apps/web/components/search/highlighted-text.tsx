import type { Highlight } from '@learny/contracts';

interface HighlightedTextProps {
  text: string;
  highlights: readonly Highlight[];
}

/**
 * Renders `text` as plain text, wrapping the validated half-open ranges in <mark>. Ranges are
 * clamped to the text and overlapping ranges are merged, so a malformed range can never crash or
 * inject markup (SPEC-307 ET-3).
 */
export const HighlightedText = ({ text, highlights }: HighlightedTextProps) => {
  const ranges = highlights
    .map((range) => ({
      start: Math.max(0, Math.min(range.start, text.length)),
      end: Math.max(0, Math.min(range.end, text.length)),
    }))
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);

  const parts: Array<string | { start: number; end: number }> = [];
  let cursor = 0;
  for (const range of ranges) {
    const start = Math.max(range.start, cursor);
    if (start > cursor) parts.push(text.slice(cursor, start));
    if (range.end > start) {
      parts.push({ start, end: range.end });
      cursor = range.end;
    }
  }
  if (cursor < text.length) parts.push(text.slice(cursor));

  return (
    <>
      {parts.map((part, index) =>
        typeof part === 'string' ? (
          <span key={`text-${String(index)}`}>{part}</span>
        ) : (
          <mark
            key={`mark-${String(part.start)}-${String(part.end)}`}
            className="rounded-4 bg-lime-soft px-[1px] text-ink"
          >
            {text.slice(part.start, part.end)}
          </mark>
        ),
      )}
    </>
  );
};
