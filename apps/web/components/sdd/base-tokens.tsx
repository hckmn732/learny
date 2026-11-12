import type { ReactNode } from 'react';

// Base-token layout of the P2 demonstration pages (SPEC-201 §10): page background #F4F4F1, white
// cards with a #E7E6E1 border and a 24 px radius. SPEC-301 replaces it with @learny/ui tokens.
export const BASE_TOKENS = {
  background: '#F4F4F1',
  card: '#FFFFFF',
  border: '#E7E6E1',
  text: '#111113',
  radius: '24px',
} as const;

/** Sets the page background without touching the shared layout used by the other demos. */
export function BaseTokenStyle() {
  return <style>{`body { background-color: ${BASE_TOKENS.background}; }`}</style>;
}

export function BaseCard({
  testId,
  title,
  children,
}: Readonly<{ testId: string; title: string; children: ReactNode }>) {
  return (
    <section
      data-testid={testId}
      className="mt-6 rounded-[24px] border border-solid border-[#E7E6E1] bg-white p-6"
    >
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
