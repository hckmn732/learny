'use client';

import { useMutation } from '@tanstack/react-query';

import { isSafeRelativePath } from '@learny/contracts';

import { ApiError, api } from '../../lib/api-client';
import { fr } from '../../messages/fr';

import { BaseCard, BaseTokenStyle } from './base-tokens';

const t = fr.sdd.spec210;

const buttonClass =
  'rounded-[12px] bg-[#111113] px-4 py-2 text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2';
const ghostClass =
  'rounded-[12px] border border-solid border-[#E7E6E1] bg-white px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2';

function go(path: string, fallback: string): void {
  window.location.assign(isSafeRelativePath(path) ? path : fallback);
}

function describe(error: unknown): string {
  return error instanceof ApiError ? `${error.code} (${String(error.status)})` : String(error);
}

/** Buttons of the simulated Checkout page (SPEC-210 EF-7). */
export function MockCheckout({ sessionId }: Readonly<{ sessionId: string | null }>) {
  const pay = useMutation({
    mutationFn: () => api.devStripeCheckoutPay({ body: { sessionId: sessionId ?? '' } }),
    onSuccess: ({ redirectTo }) => {
      go(redirectTo, '/');
    },
  });
  const cancel = useMutation({
    mutationFn: () => api.devStripeCheckoutCancel({ body: { sessionId: sessionId ?? '' } }),
    onSuccess: ({ redirectTo }) => {
      go(redirectTo, '/');
    },
  });
  const busy = pay.isPending || cancel.isPending;
  const failure = pay.error ?? cancel.error;

  return (
    <>
      <BaseTokenStyle />
      <BaseCard testId="stripe-mock-checkout" title={t.checkout.title}>
        <p data-testid="stripe-mock-notice" className="text-sm font-semibold">
          {t.checkout.notice}
        </p>
        {sessionId === null ? (
          <p className="mt-3 text-sm">{t.checkout.missing}</p>
        ) : (
          <>
            <p className="mt-3 text-sm">{t.checkout.intro}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={() => {
                  pay.mutate();
                }}
              >
                {t.checkout.pay}
              </button>
              <button
                type="button"
                className={ghostClass}
                disabled={busy}
                onClick={() => {
                  cancel.mutate();
                }}
              >
                {t.checkout.cancel}
              </button>
            </div>
          </>
        )}
        <div aria-live="polite">
          {failure === null ? null : (
            <p role="alert" className="mt-3 text-sm">
              {`${t.checkout.error} ${describe(failure)}`}
            </p>
          )}
        </div>
      </BaseCard>
    </>
  );
}

/** Buttons of the simulated customer portal (SPEC-210 EF-7). */
export function MockPortal({ returnPath }: Readonly<{ returnPath: string }>) {
  const cancel = useMutation({
    mutationFn: () => api.devStripeSimulate({ body: { action: 'cancel' } }),
    onSuccess: () => {
      go(returnPath, '/');
    },
  });

  return (
    <>
      <BaseTokenStyle />
      <BaseCard testId="stripe-mock-portal" title={t.portal.title}>
        <p data-testid="stripe-mock-notice" className="text-sm font-semibold">
          {t.portal.notice}
        </p>
        <p className="mt-3 text-sm">{t.portal.intro}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className={buttonClass}
            disabled={cancel.isPending}
            onClick={() => {
              cancel.mutate();
            }}
          >
            {t.portal.cancel}
          </button>
          <button
            type="button"
            className={ghostClass}
            onClick={() => {
              go(returnPath, '/');
            }}
          >
            {t.portal.back}
          </button>
        </div>
        <div aria-live="polite">
          {cancel.isError ? (
            <p role="alert" className="mt-3 text-sm">
              {`${t.checkout.error} ${describe(cancel.error)}`}
            </p>
          ) : null}
        </div>
      </BaseCard>
    </>
  );
}
