'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { cn } from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.auth.layout;

const STEPS = ['compte', 'verification', 'profil', 'rythme', 'ia', 'rappels', 'depart'] as const;

export type AuthStep = {
  /** Zero-based current step, or null when the page is outside the stepper. */
  current: number | null;
  /** French counter shown above the progress segments. */
  label: string;
};

const BY_SEGMENT: Record<string, number> = {
  compte: 0,
  verification: 1,
  'verifier-email': 1,
  profil: 2,
  rythme: 3,
  ia: 4,
  rappels: 5,
  depart: 6,
};

/**
 * Stepper state derived from the pathname (SPEC-308 EF-4). Kept pure so the unit tests can check
 * inscription, verification, sign-in and the future onboarding steps without a router.
 */
export function authStepForPath(pathname: string | null): AuthStep {
  if (pathname === '/connexion') {
    return { current: 0, label: t.signInCounter };
  }
  const segment = pathname?.split('/').filter(Boolean).at(-1) ?? 'compte';
  const current = BY_SEGMENT[segment] ?? 0;
  return {
    current,
    label: t.stepCounter(current + 1, STEPS.length, t.steps[STEPS[current] ?? 'compte']),
  };
}

function AuthLogo() {
  return (
    <div className="flex items-center gap-12 font-display text-22 font-600">
      <span
        aria-hidden="true"
        className="inline-flex size-40 items-center justify-center rounded-12 bg-lime text-ink"
      >
        <svg
          aria-hidden="true"
          fill="none"
          height="20"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.4"
          viewBox="0 0 24 24"
          width="20"
        >
          <path d="M4 19V6l8 6 8-6v13" />
        </svg>
      </span>
      {t.label}
    </div>
  );
}

export type AuthLayoutProps = {
  step: AuthStep;
  children: ReactNode;
};

/**
 * Split authentication layout of `Inscription.dc.html` (SPEC-308 EF-3): the dark Learny panel on
 * the left and the form column on the right, stacked by `flex-wrap` under 900 px. It never mounts
 * the connected shell.
 */
export function AuthLayout({ step, children }: Readonly<AuthLayoutProps>) {
  return (
    <div className="flex min-h-[90vh] flex-wrap bg-canvas text-ink" data-testid="auth-layout">
      <aside
        aria-label={t.label}
        className="flex flex-[1_1_23.75rem] flex-col gap-28 bg-ink p-40 text-white"
        data-testid="auth-panel"
      >
        <AuthLogo />
        <div className="mt-auto flex flex-col gap-14">
          <p className="m-0 font-display text-34 font-600 leading-1.15 tracking-title">
            {t.tagline[0]}
            <br />
            {t.tagline[1]}
          </p>
          <p className="m-0 text-15 leading-1.55 text-on-dark-secondary">{t.intro}</p>
        </div>
        <ul className="m-0 flex list-none flex-col gap-12 p-0 text-14 leading-1.2 text-on-dark-secondary">
          {t.benefits.map((benefit) => (
            <li className="flex gap-10" key={benefit}>
              <span aria-hidden="true" className="font-700 text-lime">
                ✓
              </span>
              {benefit}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-8" data-testid="auth-stepper">
          <span
            className="text-12 font-600 tracking-eyebrow text-on-dark-muted uppercase leading-1.2"
            data-testid="auth-step-counter"
          >
            {step.label}
          </span>
          <ol aria-label={t.stepsLabel} className="m-0 flex list-none gap-6 p-0">
            {STEPS.map((name, index) => {
              const state =
                step.current === null
                  ? 'upcoming'
                  : index < step.current
                    ? 'done'
                    : index === step.current
                      ? 'current'
                      : 'upcoming';
              return (
                <li
                  aria-current={state === 'current' ? 'step' : undefined}
                  className={cn(
                    'relative h-6 flex-1 rounded-3',
                    state === 'done' && 'bg-lime',
                    state === 'current' && 'bg-white',
                    state === 'upcoming' && 'bg-dark-600',
                  )}
                  data-testid={`auth-step-${String(index + 1)}`}
                  key={name}
                >
                  <span className="sr-only">{t.stepAria(index + 1, t.steps[name], state)}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </aside>
      <main
        className="flex min-w-0 flex-[999_1_35rem] items-center justify-center px-24 py-32 sm:px-40 sm:py-48"
        data-testid="auth-main"
      >
        <div className="flex w-full max-w-[35rem] flex-col gap-24" data-testid="auth-content">
          {children}
        </div>
      </main>
    </div>
  );
}

/** Route layout wrapper: derives the stepper state from the current pathname. */
export function AuthLayoutRoute({ children }: Readonly<{ children: ReactNode }>) {
  return <AuthLayout step={authStepForPath(usePathname())}>{children}</AuthLayout>;
}
