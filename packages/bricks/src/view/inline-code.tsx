import katex from 'katex';
import { Fragment } from 'react';

/**
 * Hotfix QA — short course and quiz fields are plain strings in which the model writes inline code
 * between backticks and mathematics in LaTeX between `$…$` (or `$$…$$`). Code is rendered as
 * `<code>`, mathematics with KaTeX (no `\href`, no HTML: `trust` stays off); nothing else is
 * interpreted.
 */
const TOKENS = /(`[^`\n]+`|\$\$[^$]+\$\$|\$(?!\s)[^$\n]+?(?<!\s)\$(?!\d))/u;

/** KaTeX markup of one formula; an invalid formula is shown as its source, in red, never thrown. */
export function mathMarkup(tex: string, display: boolean): string {
  return katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    trust: false,
    output: 'htmlAndMathml',
  });
}

export function InlineCode({ text }: { text: string }) {
  const parts = text.split(TOKENS);
  return (
    <>
      {parts.map((part, index) => {
        const key = `part-${String(index)}`;
        if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
          return (
            <code className="rounded-6 bg-black/10 px-4 py-1 font-mono text-[0.92em]" key={key}>
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.length > 4 && part.startsWith('$$') && part.endsWith('$$')) {
          return (
            <span
              className="block overflow-x-auto py-4"
              key={key}
              // KaTeX output of a formula: escaped text, `trust: false` (no link, no raw HTML).
              dangerouslySetInnerHTML={{ __html: mathMarkup(part.slice(2, -2), true) }}
            />
          );
        }
        if (part.length > 2 && part.startsWith('$') && part.endsWith('$')) {
          return (
            <span
              key={key}
              dangerouslySetInnerHTML={{ __html: mathMarkup(part.slice(1, -1), false) }}
            />
          );
        }
        return <Fragment key={key}>{part}</Fragment>;
      })}
    </>
  );
}
