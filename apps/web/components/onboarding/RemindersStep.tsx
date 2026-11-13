'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { ReminderChoices } from '@learny/contracts';
import { AppError } from '@learny/core';
import { Button, Card, FormError, Switch } from '@learny/ui';

import { api } from '../../lib/api-client';
import { createPushGateway, type PushGateway } from '../../lib/push-onboarding';
import { fr } from '../../messages/fr';

import { StepHeading } from './StepHeading';

const t = fr.onboarding.rappels;

export interface RemindersStepProps {
  initial: ReminderChoices;
  needsCheckout: boolean;
  publicKey: string | undefined;
  /** Test seam: a simulated browser, without touching the real permission prompt. */
  pushGateway?: PushGateway;
}

/** SPEC-602 EF-9, EF-10 — three switches, permission asked from the click, then Checkout or Départ. */
export function RemindersStep({
  initial,
  needsCheckout,
  publicKey,
  pushGateway,
}: Readonly<RemindersStepProps>) {
  const router = useRouter();
  const [choices, setChoices] = useState<ReminderChoices>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: keyof ReminderChoices, value: boolean): void => {
    setChoices((previous) => ({ ...previous, [key]: value }));
    setError(null);
  };

  const startCheckout = async (): Promise<void> => {
    const { url } = await api.billingCheckout({
      body: {
        successPath: '/premiers-pas/depart?abonnement=ok',
        cancelPath: '/premiers-pas/depart?abonnement=annule',
      },
    });
    window.location.assign(url);
  };

  const save = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    setError(null);
    let push = false;
    try {
      if (choices.push) {
        const gateway = pushGateway ?? createPushGateway(publicKey);
        push = await gateway.subscribe();
      }
      const reminders = { ...choices, push };
      await api.meOnboardingUpdate({ body: { step: 'depart', reminders } });
      if (needsCheckout) {
        await startCheckout();
        return;
      }
      router.push('/premiers-pas/depart');
      router.refresh();
    } catch (cause) {
      if (cause instanceof AppError && cause.code === 'ALREADY_SUBSCRIBED') {
        router.push('/premiers-pas/depart');
        router.refresh();
      } else {
        setError(fr.onboarding.common.saveError);
      }
    } finally {
      setSaving(false);
    }
  };

  const rows = [
    {
      key: 'push' as const,
      testId: 'reminder-push',
      label: t.push,
      description: t.pushDescription,
    },
    {
      key: 'email' as const,
      testId: 'reminder-email',
      label: t.email,
      description: t.emailDescription,
    },
    {
      key: 'automations' as const,
      testId: 'reminder-automations',
      label: t.automations,
      description: t.automationsDescription,
    },
  ];

  return (
    <section className="flex flex-col gap-24" data-testid="onboarding-step-rappels">
      <button
        className="self-start text-14 font-600 text-ink-muted"
        data-testid="onboarding-back"
        onClick={() => {
          router.push('/premiers-pas/ia');
        }}
        type="button"
      >
        ‹ {fr.onboarding.common.back}
      </button>
      <StepHeading subtitle={t.subtitle} title={t.title} />
      <Card className="flex flex-col gap-0 py-12" padding="none">
        {rows.map((row, index) => {
          const labelId = `reminder-${row.key}-label`;
          const descriptionId = `reminder-${row.key}-description`;
          return (
            <div
              className={
                index === rows.length - 1
                  ? 'flex items-center gap-14 px-24 py-12'
                  : 'flex items-center gap-14 border-b border-divider px-24 py-12'
              }
              key={row.key}
            >
              <span className="flex flex-1 flex-col gap-2">
                <span className="text-14 font-700" id={labelId}>
                  {row.label}
                </span>
                <span className="text-13 text-ink-muted" id={descriptionId}>
                  {row.description}
                </span>
              </span>
              <Switch
                aria-describedby={descriptionId}
                aria-labelledby={labelId}
                checked={choices[row.key]}
                data-testid={row.testId}
                onCheckedChange={(checked) => {
                  toggle(row.key, checked);
                }}
              />
            </div>
          );
        })}
        <p className="mx-24 my-8 text-13 leading-1.5 text-ink-muted">{t.note}</p>
      </Card>
      {error === null ? null : <FormError data-testid="reminders-error">{error}</FormError>}
      <Button
        data-testid="onboarding-continue"
        fullWidth
        loading={saving}
        onClick={() => {
          void save();
        }}
        size="xl"
        type="button"
        variant="dark"
      >
        {fr.onboarding.common.continue}
      </Button>
    </section>
  );
}
