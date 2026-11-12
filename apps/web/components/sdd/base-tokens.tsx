import type { ReactNode } from 'react';

import { colors, px } from '@learny/ui/tokens';

// Base-token layout of the P2 demonstration pages (SPEC-201 §10), now sourced from the design
// tokens (SPEC-301): canvas background, surface cards, standard border and 24 px radius.
export const BASE_TOKENS = {
  background: colors.canvas,
  card: colors.surface,
  border: colors.border,
  text: colors.ink,
  radius: px(24),
} as const;

/** Sets the page background without touching the shared layout used by the other demos. */
export function BaseTokenStyle() {
  return <style>{`body { background-color: ${BASE_TOKENS.background}; }`}</style>;
}

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
