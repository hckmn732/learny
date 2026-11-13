'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import type { AiCredentialProvider } from '@learny/contracts';
import { Button, Card, ChoiceGroup, FormError, Select, TextField, cn } from '@learny/ui';

import { api } from '../../lib/api-client';
import { fr } from '../../messages/fr';

import { StepHeading } from './StepHeading';
import { useCredentialQualification, type QualificationStatus } from './useCredentialQualification';

const t = fr.onboarding.ia;

type Choice = 'own' | 'managed';

const STATUS_CLASS: Record<QualificationStatus, string> = {
  untested: 'text-ink-muted',
  testing: 'text-ink-muted',
  qualified: 'text-green-ink',
  refused: 'text-orange-ink',
  bricks: 'text-orange-ink',
  timeout: 'text-orange-ink',
};

export interface AiStepProps {
  recommendedModels: Record<string, readonly string[]>;
}

/** SPEC-602 EF-5 to EF-8 — choice of the AI, personal key battery and five task assignments. */
export function AiStep({ recommendedModels }: Readonly<AiStepProps>) {
  const router = useRouter();
  const [choice, setChoice] = useState<Choice>('own');
  const [provider, setProvider] = useState<AiCredentialProvider>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const providerId = useId();
  const list = recommendedModels[provider] ?? [];
  const showModel = provider === 'openai_compatible' || list.length === 0;

  const qualification = useCredentialQualification({
    provider,
    apiKey,
    baseUrl,
    model,
    recommendedModels: list,
    onKeyAccepted: () => {
      setApiKey('');
    },
  });

  const goBack = (): void => {
    router.push('/premiers-pas/rythme');
  };

  const continueStep = (): void => {
    if (saving) return;
    setError(null);
    if (choice === 'managed') {
      setSaving(true);
      void api
        .meOnboardingUpdate({ body: { step: 'rappels', aiChoice: 'managed' } })
        .then(() => {
          router.push('/premiers-pas/rappels');
          router.refresh();
        })
        .catch(() => {
          setError(fr.onboarding.common.saveError);
        })
        .finally(() => {
          setSaving(false);
        });
      return;
    }
    if (
      qualification.status !== 'qualified' ||
      qualification.credentialId === null ||
      qualification.modelId === null
    ) {
      setError(t.continueError);
      return;
    }
    setSaving(true);
    void qualification
      .assignAll(qualification.credentialId, qualification.modelId)
      .then(() => api.meOnboardingUpdate({ body: { step: 'rappels' } }))
      .then(() => {
        router.push('/premiers-pas/rappels');
        router.refresh();
      })
      .catch(() => {
        setError(fr.onboarding.common.saveError);
      })
      .finally(() => {
        setSaving(false);
      });
  };

  return (
    <section className="flex flex-col gap-24" data-testid="onboarding-step-ia">
      <button
        className="self-start text-14 font-600 text-ink-muted"
        data-testid="onboarding-back"
        onClick={goBack}
        type="button"
      >
        ‹ {fr.onboarding.common.back}
      </button>
      <StepHeading subtitle={t.subtitle} title={t.title} />
      <ChoiceGroup
        aria-label={t.choicesLabel}
        onValueChange={(value) => {
          setChoice(value as Choice);
          setError(null);
        }}
        options={[
          {
            value: 'own',
            testId: 'ai-choice-own',
            label: (
              <span className="flex flex-wrap items-center gap-8">
                {t.ownLabel}
                <span className="rounded-full bg-lime-softer px-8 py-2 text-12 font-700 text-lime-ink-strong">
                  {t.ownPill}
                </span>
              </span>
            ),
            description: t.ownDescription,
          },
          {
            value: 'managed',
            testId: 'ai-choice-managed',
            label: (
              <span className="flex flex-wrap items-center gap-8">
                {t.managedLabel}
                <span className="rounded-full bg-indigo-soft px-8 py-2 text-12 font-700 text-indigo-ink-strong">
                  {t.managedPill}
                </span>
              </span>
            ),
            description: t.managedDescription,
          },
        ]}
        value={choice}
      />

      {choice === 'own' ? (
        <Card className="flex flex-col gap-14" padding="lg">
          <div className="flex flex-wrap gap-12">
            <Select
              className="flex-[1_1_11.25rem]"
              data-testid="ai-provider"
              id={providerId}
              label={t.provider}
              onChange={(event) => {
                setProvider(event.target.value as AiCredentialProvider);
                setModel('');
                qualification.reset();
                setError(null);
              }}
              options={[
                { value: 'anthropic', label: t.providers.anthropic },
                { value: 'openai', label: t.providers.openai },
                { value: 'mistral', label: t.providers.mistral },
                { value: 'openai_compatible', label: t.providers.openai_compatible },
              ]}
              value={provider}
            />
            <TextField
              autoComplete="off"
              className="flex-[2_1_15rem]"
              data-testid="ai-key"
              label={t.keyLabel}
              onChange={(event) => {
                setApiKey(event.target.value);
                qualification.reset();
                setError(null);
              }}
              placeholder={t.keyPlaceholder}
              type="password"
              value={apiKey}
            />
          </div>
          {provider === 'openai_compatible' ? (
            <TextField
              data-testid="ai-base-url"
              label={t.baseUrl}
              onChange={(event) => {
                setBaseUrl(event.target.value);
                qualification.reset();
              }}
              placeholder={t.baseUrlPlaceholder}
              type="url"
              value={baseUrl}
            />
          ) : null}
          {showModel ? (
            <TextField
              data-testid="ai-model"
              label={t.model}
              onChange={(event) => {
                setModel(event.target.value);
                qualification.reset();
              }}
              value={model}
            />
          ) : null}
          <div className="flex flex-wrap items-center gap-12">
            <Button
              data-testid="ai-test"
              disabled={qualification.status === 'testing'}
              onClick={() => {
                void qualification.test();
              }}
              size="md"
              type="button"
              variant="outline"
            >
              {t.test}
            </Button>
            <span
              aria-live="polite"
              className={cn('text-13 font-700', STATUS_CLASS[qualification.status])}
              data-testid="ai-status"
              data-status={qualification.status}
              role="status"
            >
              {t.status[qualification.status]}
            </span>
          </div>
          <p className="m-0 text-12 leading-1.5 text-ink-muted">{t.note}</p>
        </Card>
      ) : (
        <Card className="flex flex-col gap-8 text-14 leading-1.55 text-ink-secondary" padding="lg">
          <p className="m-0">
            <strong className="text-ink">{t.managedTitle}</strong> {t.managedCap}
          </p>
          <p className="m-0">{t.managedPayment}</p>
        </Card>
      )}

      {error === null ? null : <FormError data-testid="ai-error">{error}</FormError>}
      <Button
        data-testid="onboarding-continue"
        fullWidth
        loading={saving}
        onClick={continueStep}
        size="xl"
        type="button"
        variant="dark"
      >
        {fr.onboarding.common.continue}
      </Button>
    </section>
  );
}
