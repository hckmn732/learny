import { cn } from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.auth.layout;

/** Seven account steps of SCR-01/SCR-02, in the mockup order. */
export const AUTH_STEPS = [
  'compte',
  'verification',
  'profil',
  'rythme',
  'ia',
  'rappels',
  'depart',
] as const;

export type AuthStepName = (typeof AUTH_STEPS)[number];

export interface AuthStepperProps {
  /** Zero-based current step, from 0 to 6. */
  current: number;
  /** Counter text, e.g. « Étape 1 sur 7 · Compte » or « Connexion ». */
  label: string;
}

/**
 * Accessible progress of the authentication flow (SPEC-601 ET-1, EF-2): labelled counter and
 * seven segments whose state is repeated in visually hidden text.
 */
export function AuthStepper({ current, label }: Readonly<AuthStepperProps>) {
  const bounded = Math.min(Math.max(0, Math.trunc(current)), AUTH_STEPS.length - 1);

  return (
    <div className="flex flex-col gap-8" data-testid="auth-stepper">
      <span
        className="text-12 font-600 tracking-eyebrow text-on-dark-muted uppercase leading-1.2"
        data-testid="auth-step-counter"
      >
        {label}
      </span>
      <ol aria-label={t.stepsLabel} className="m-0 flex list-none gap-6 p-0">
        {AUTH_STEPS.map((name, index) => {
          const state = index < bounded ? 'done' : index === bounded ? 'current' : 'upcoming';
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
  );
}
