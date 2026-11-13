'use client';

import { useEffect, useRef } from 'react';

/** ET-7 — the heading receives focus when a step mounts (keyboard and screen readers). */
export function StepHeading({ title, subtitle }: Readonly<{ title: string; subtitle: string }>) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="flex flex-col gap-6">
      <h1
        className="m-0 font-display text-32 font-600 tracking-title outline-none"
        ref={ref}
        tabIndex={-1}
      >
        {title}
      </h1>
      <p className="m-0 text-15 text-ink-muted">{subtitle}</p>
    </div>
  );
}
