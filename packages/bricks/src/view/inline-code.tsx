import { Fragment } from 'react';

/**
 * Hotfix QA — short course fields (flash question, comparison, takeaway) are plain strings in which
 * the model writes inline code between backticks. They are rendered as `<code>` instead of showing
 * the raw backticks; nothing else is interpreted (no HTML, no other Markdown).
 */
export function InlineCode({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]+`)/u);
  return (
    <>
      {parts.map((part, index) =>
        part.length > 2 && part.startsWith('`') && part.endsWith('`') ? (
          <code
            className="rounded-6 bg-black/10 px-4 py-1 font-mono text-[0.92em]"
            key={`code-${String(index)}`}
          >
            {part.slice(1, -1)}
          </code>
        ) : (
          <Fragment key={`text-${String(index)}`}>{part}</Fragment>
        ),
      )}
    </>
  );
}
