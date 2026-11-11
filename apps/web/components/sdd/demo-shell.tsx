import type { ReactNode } from 'react';

import { clock } from '@learny/core';

import { fr } from '../../messages/fr';

const TIME_ZONE = 'Europe/Paris';

const formatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  dateStyle: 'short',
  timeStyle: 'medium',
});

export function DemoShell({
  specId,
  title,
  children,
}: Readonly<{ specId: string; title: string; children: ReactNode }>) {
  return (
    <main data-testid="sdd-demo" className="mx-auto max-w-4xl p-8">
      <p data-testid="sdd-demo-spec" className="text-sm font-medium uppercase tracking-wide">
        {specId}
      </p>
      <h1 data-testid="sdd-demo-title" className="mt-2 font-display text-3xl font-semibold">
        {title}
      </h1>
      <p data-testid="sdd-demo-clock" className="mt-2 text-sm">
        {`${fr.sdd.clockLabel} : ${formatter.format(clock.now())} (${TIME_ZONE})`}
      </p>
      {children}
    </main>
  );
}

export function DemoSection({
  testId,
  title,
  children,
}: Readonly<{ testId: string; title: string; children: ReactNode }>) {
  return (
    <section
      data-testid={testId}
      className="mt-6 rounded-[16px] border border-solid border-[#E7E6E1] p-6"
    >
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
