import type { Components } from 'react-markdown';
import Markdown from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

import { cn } from '@learny/ui';

const COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="m-0 font-display text-34 font-600 leading-1.2 tracking-title">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-12 mb-0 font-display text-26 font-600 leading-1.3 tracking-heading">
      {children}
    </h2>
  ),
  h3: ({ children }) => <h3 className="mt-8 mb-0 font-display text-20 font-600">{children}</h3>,
  p: ({ children }) => <p className="m-0 text-17 leading-1.7">{children}</p>,
  ul: ({ children }) => <ul className="m-0 flex list-none flex-col gap-10 p-0">{children}</ul>,
  ol: ({ children }) => (
    <ol className="m-0 flex list-decimal flex-col gap-10 pl-22" start={1}>
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="relative pl-18 text-17 leading-1.7 before:absolute before:top-11 before:left-0 before:size-8 before:rounded-2 before:bg-ink before:content-['']">
      {children}
    </li>
  ),
  table: ({ children }) => (
    <div
      aria-label="Tableau"
      className="overflow-x-auto rounded-18 border border-solid border-border"
      role="region"
      tabIndex={0}
    >
      <table className="w-full min-w-420 border-collapse text-17 leading-1.4">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-canvas text-left">{children}</thead>,
  th: ({ children }) => (
    <th className="px-18 py-12 text-13 font-700" scope="col">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-t border-solid border-divider px-18 py-14">{children}</td>
  ),
  tr: ({ children }) => <tr className="border-t border-solid border-divider">{children}</tr>,
  a: ({ href, children }) => (
    <a className="font-600 text-indigo-ink underline" href={href}>
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-700">{children}</strong>,
  code: ({ children }) => (
    <code className="rounded-4 bg-canvas px-4 py-1 font-mono text-15">{children}</code>
  ),
  blockquote: ({ children }) => (
    <blockquote className="m-0 border-l-4 border-solid border-lime pl-16 text-ink-secondary">
      {children}
    </blockquote>
  ),
};

/** Only safe schemes reach the DOM; a `javascript:` URL becomes an empty href (CL-3). */
function safeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^(https?:|mailto:|#|\/|\.{0,2}\/)/i.test(trimmed)) return trimmed;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return '';
}

export interface MarkdownContentProps {
  markdown: string;
  className?: string;
}

/** Sanitised Markdown renderer (ADR-0060): no raw HTML, GFM tables and task lists. */
export function MarkdownContent({ markdown, className }: MarkdownContentProps) {
  return (
    <div className={cn('flex flex-col gap-12 break-words', className)} data-testid="brick-markdown">
      <Markdown
        components={COMPONENTS}
        rehypePlugins={[[rehypeSanitize, defaultSchema]]}
        remarkPlugins={[remarkGfm]}
        urlTransform={safeUrl}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
