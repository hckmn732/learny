import type { ReactNode } from 'react';

// Base-token layout of the P2 demonstration pages (SPEC-201 §10), sourced from the design tokens
// (SPEC-301): surface cards, standard border and 24 px radius.
//
// The canvas background used to be set by a `<style>{`body { … }`}</style>` injected by
// `BaseTokenStyle`. SPEC-805 made `style-src-elem` nonce-based, so that element was refused by the
// CSP of every demo page: the rule never applied. The same token is already the background of the
// shared layout (`body.bg-canvas`, `--color-canvas: #F4F4F1`), so the component is gone and the
// demos rely on the layout instead of injecting CSS of their own (CL-8: no inline <style>).
export function BaseCard({
  testId,
  title,
  role,
  children,
}: Readonly<{ testId: string; title: string; role?: 'status'; children: ReactNode }>) {
  return (
    <section
      data-testid={testId}
      {...(role === undefined ? {} : { role })}
      className="mt-6 rounded-24 border border-solid border-border bg-surface p-6"
    >
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
