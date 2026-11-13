'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { useForm, useWatch, type FieldErrors, type Resolver } from 'react-hook-form';

import { ACCOUNT_RULES } from '@learny/config/product';
import {
  createLoginAccountFormSchema,
  createSignupAccountFormSchema,
  type AccountFormMessages,
} from '@learny/contracts';
import { AppError, clock } from '@learny/core';
import { Button, Card, Checkbox, ChoiceGroup, FormError, Link, TextField } from '@learny/ui';
import { colors } from '@learny/ui/tokens';

import { api } from '../../lib/api-client';
import { passwordStrength } from '../../lib/auth/password-strength';
import {
  readAuthDraft,
  saveAuthDraft,
  savePendingAuth,
  type AuthIntent,
  type AuthMethod,
} from '../../lib/auth/pending-auth';
import { fr } from '../../messages/fr';

const t = fr.auth;

type AccountMode = 'signup' | 'login';

type FormValues = {
  method: AuthMethod;
  email: string;
  password: string;
  termsAccepted: boolean;
};

export interface AccountFormProps {
  mode: AccountMode;
  /** Message read from `?erreur=` on the sign-in page (EF-11). */
  initialError?: string | undefined;
}

const MESSAGES: AccountFormMessages = t.validation;

function timeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ACCOUNT_RULES.defaultTimeZone;
  } catch {
    return ACCOUNT_RULES.defaultTimeZone;
  }
}

function firstFieldError(
  errors: FieldErrors<FormValues>,
  method: AuthMethod,
  mode: AccountMode,
): { key: keyof FormValues; message: string } | null {
  const order: (keyof FormValues)[] = [
    'email',
    ...(method === 'password' ? (['password'] as const) : []),
    ...(mode === 'signup' ? (['termsAccepted'] as const) : []),
  ];
  for (const key of order) {
    const message = errors[key]?.message;
    if (typeof message === 'string' && message !== '') return { key, message };
  }
  return null;
}

function validationMessage(error: AppError): string {
  const path = error.errors?.[0]?.path ?? '';
  if (path.endsWith('email')) return t.validation.email;
  if (path.endsWith('password')) return t.validation.passwordSignup;
  if (path.endsWith('acceptedTerms') || path.endsWith('termsAccepted')) return t.validation.terms;
  return t.errors.network;
}

/**
 * Account step of SCR-01 (SPEC-601 EF-3, EF-4, EF-6, EF-7): one client component for both modes,
 * two mutually exclusive methods, a password strength indicator at sign-up and the legal
 * acceptance. Only the first validation failure is shown, in the order of EF-6.
 */
export function AccountForm({ mode, initialError }: Readonly<AccountFormProps>) {
  const router = useRouter();
  const hintId = useId();
  const [globalError, setGlobalError] = useState<string | null>(initialError ?? null);
  const [submitting, setSubmitting] = useState(false);

  const schema =
    mode === 'signup'
      ? createSignupAccountFormSchema(MESSAGES)
      : createLoginAccountFormSchema(MESSAGES);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    shouldFocusError: false,
    defaultValues: { method: 'magic', email: '', password: '', termsAccepted: false },
  });

  const method = useWatch({ control: form.control, name: 'method' });
  const password = useWatch({ control: form.control, name: 'password' });
  const termsAccepted = useWatch({ control: form.control, name: 'termsAccepted' });
  const strength = passwordStrength(password);
  const strengthHint =
    password.length === 0
      ? t.account.strengthEmpty
      : strength >= 3
        ? t.account.strengthStrong
        : t.account.strengthWeak;

  // The address and the method survive the sign-up ↔ sign-in switch without ever entering the URL
  // (CL-11, ADR-0168).
  useEffect(() => {
    const draft = readAuthDraft();
    if (draft === null) return;
    form.setValue('email', draft.email);
    form.setValue('method', draft.method);
  }, [form]);

  const rememberDraft = (): void => {
    saveAuthDraft({ email: form.getValues('email'), method: form.getValues('method') });
  };

  const clearError = (): void => {
    if (globalError !== null) setGlobalError(null);
  };

  const send = async (values: FormValues): Promise<void> => {
    if (submitting) return;
    setSubmitting(true);
    setGlobalError(null);
    const email = values.email.trim();
    const timezone = timeZone();
    const intent: AuthIntent = mode;
    const selectedMethod = values.method;

    try {
      if (mode === 'signup' && selectedMethod === 'magic') {
        await api.authMagicLink({
          body: { mode: 'sign-up', email, acceptedTerms: true, timezone },
        });
        savePendingAuth({
          email,
          method: 'magic',
          intent,
          sentAt: clock.now().toISOString(),
        });
        router.push('/verifier-email');
        return;
      }
      if (mode === 'signup' && selectedMethod === 'password') {
        await api.authSignUp({
          body: { email, password: values.password, acceptedTerms: true, timezone },
        });
        savePendingAuth({
          email,
          method: 'password',
          intent,
          sentAt: clock.now().toISOString(),
        });
        router.push('/verifier-email');
        return;
      }
      if (mode === 'login' && selectedMethod === 'magic') {
        await api.authMagicLink({ body: { mode: 'sign-in', email } });
        savePendingAuth({
          email,
          method: 'magic',
          intent,
          sentAt: clock.now().toISOString(),
        });
        router.push('/verifier-email');
        return;
      }
      const { destination } = await api.authSignIn({
        body: { email, password: values.password },
      });
      router.push(destination);
      router.refresh();
    } catch (error) {
      if (error instanceof AppError && error.code === 'EMAIL_NOT_CONFIRMED') {
        // EF-12: resend the confirmation link, then show the verification screen. A refused resend
        // (the initial mail is still recent) does not block the navigation.
        try {
          await api.authResend({ body: { email, kind: 'signup' } });
        } catch {
          // The link of the initial sign-up is still valid; the screen stays actionable.
        }
        savePendingAuth({
          email,
          method: 'password',
          intent: 'signup',
          sentAt: clock.now().toISOString(),
          notice: 'confirmation_resent',
        });
        router.push('/verifier-email');
        return;
      }
      if (error instanceof AppError) {
        if (error.code === 'INVALID_CREDENTIALS') setGlobalError(t.errors.invalidCredentials);
        else if (error.code === 'RATE_LIMITED' || error.code === 'RESEND_TOO_SOON')
          setGlobalError(t.errors.rateLimited);
        else if (error.code === 'VALIDATION_FAILED') setGlobalError(validationMessage(error));
        else if (
          error.code === 'NETWORK_ERROR' ||
          error.code === 'SERVICE_UNAVAILABLE' ||
          error.code === 'INTERNAL_ERROR'
        )
          setGlobalError(t.errors.network);
        else setGlobalError(t.errors.network);
      } else {
        setGlobalError(t.errors.network);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submit = form.handleSubmit(
    (values) => {
      void send(values);
    },
    (errors) => {
      const first = firstFieldError(errors, form.getValues('method'), mode);
      if (first !== null) {
        setGlobalError(first.message);
        form.setFocus(first.key);
      }
    },
  );

  const switchHref = mode === 'signup' ? '/connexion' : '/inscription';
  const switchText = mode === 'signup' ? t.signup.switchText : t.signIn.switchText;
  const switchCta = mode === 'signup' ? t.signup.switchCta : t.signIn.switchCta;
  const submitLabel =
    mode === 'signup'
      ? method === 'magic'
        ? t.submit.signupMagic
        : t.submit.signupPassword
      : method === 'magic'
        ? t.submit.loginMagic
        : t.submit.loginPassword;

  const emailId = 'auth-email';
  const passwordId = 'auth-password';
  const errorDescribedBy = globalError === null ? undefined : 'auth-error';

  return (
    <div
      className="flex flex-col gap-24"
      data-testid={mode === 'signup' ? 'auth-page-signup' : 'auth-page-signin'}
    >
      <div className="flex flex-col gap-6">
        <h1 className="m-0 font-display text-32 font-600 tracking-title">
          {mode === 'signup' ? t.signup.title : t.signIn.title}
        </h1>
        <p className="m-0 text-15 text-ink-muted">
          {mode === 'signup' ? t.signup.subtitle : t.signIn.subtitle}
        </p>
      </div>

      <form
        data-testid="auth-form"
        method="post"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit(event);
        }}
      >
        <Card className="flex flex-col gap-18" data-testid="auth-card">
          <TextField
            autoComplete="email"
            data-testid="auth-email"
            id={emailId}
            label={t.account.emailLabel}
            placeholder={t.account.emailPlaceholder}
            type="email"
            {...form.register('email', {
              onChange: clearError,
            })}
            aria-describedby={errorDescribedBy}
          />

          <ChoiceGroup
            aria-label={t.account.methodsLabel}
            onValueChange={(value) => {
              form.setValue('method', value as AuthMethod);
              clearError();
            }}
            options={[
              {
                value: 'magic',
                label: t.account.magicLabel,
                description: t.account.magicDescription,
                testId: 'auth-method-magic',
              },
              {
                value: 'password',
                label:
                  mode === 'signup' ? t.account.passwordSignupLabel : t.account.passwordLoginLabel,
                description:
                  mode === 'signup'
                    ? t.account.passwordSignupDescription
                    : t.account.passwordLoginDescription,
                testId: 'auth-method-password',
              },
            ]}
            value={method}
          />

          {method === 'password' ? (
            <div className="flex flex-col gap-6">
              <TextField
                aria-describedby={
                  (mode === 'signup' ? [hintId, errorDescribedBy] : [errorDescribedBy])
                    .filter(Boolean)
                    .join(' ') || undefined
                }
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                data-testid="auth-password"
                id={passwordId}
                label={t.account.passwordLabel}
                placeholder={t.account.passwordPlaceholder}
                type="password"
                {...form.register('password', { onChange: clearError })}
              />
              {mode === 'signup' ? (
                <>
                  <div
                    aria-hidden="true"
                    className="flex gap-4"
                    data-strength={strength}
                    data-testid="auth-strength"
                  >
                    {[0, 1, 2, 3].map((index) => (
                      <span
                        className="h-4 flex-1 rounded-2"
                        key={index}
                        style={{
                          backgroundColor:
                            index < strength
                              ? strength >= 3
                                ? colors.teal
                                : colors.orange
                              : colors.border,
                        }}
                      />
                    ))}
                  </div>
                  <p
                    aria-live="polite"
                    className="m-0 text-12 text-ink-muted"
                    data-testid="auth-strength-hint"
                    id={hintId}
                  >
                    {strengthHint}
                  </p>
                </>
              ) : null}
            </div>
          ) : null}

          {mode === 'signup' ? (
            <Checkbox
              data-testid="auth-terms"
              label={
                <span>
                  {t.account.termsBefore}
                  <Link href="/legal/cgu" rel="noopener noreferrer" target="_blank" weight="bold">
                    {t.account.termsCgu}
                    <span className="sr-only">{t.account.legalNewTab}</span>
                  </Link>
                  {t.account.termsAnd}
                  <Link
                    href="/legal/confidentialite"
                    rel="noopener noreferrer"
                    target="_blank"
                    weight="bold"
                  >
                    {t.account.termsPrivacy}
                    <span className="sr-only">{t.account.legalNewTab}</span>
                  </Link>
                  {t.account.termsAfter}
                </span>
              }
              {...form.register('termsAccepted', {
                onChange: clearError,
              })}
              checked={termsAccepted}
            />
          ) : null}

          {globalError !== null ? (
            <FormError data-testid="auth-error" id="auth-error">
              {globalError}
            </FormError>
          ) : null}

          <Button
            data-testid="auth-submit"
            fullWidth
            loading={submitting}
            size="xl"
            type="submit"
            variant="dark"
          >
            {submitLabel}
          </Button>
        </Card>
      </form>

      <p className="m-0 text-center text-14 text-ink-muted">
        {switchText}{' '}
        <Link
          className="font-700 underline"
          data-testid="auth-switch"
          href={switchHref}
          onClick={rememberDraft}
          weight="bold"
        >
          {switchCta}
        </Link>
      </p>
    </div>
  );
}
