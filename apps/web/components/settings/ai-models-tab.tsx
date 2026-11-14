'use client';

import { useCallback, useId, useState } from 'react';

import type {
  AiCredentialProvider,
  AiModelsState,
  AiModelsTaskId,
  AiProviderCard,
  AiTaskCapabilityId,
  AiTaskModelState,
  QualificationReport,
} from '@learny/contracts';
import { Badge, Button, Card, ErrorState, FormError, Select, TextField, cn } from '@learny/ui';

import { ApiError, api } from '../../lib/api-client';
import { fr } from '../../messages/fr';
import { useCredentialQualification } from '../onboarding/useCredentialQualification';

const t = fr.settings.aiModels;

/** EF-3 — the six providers of BR-IA-02, in the order of the rule. */
const PROVIDER_OPTIONS: readonly { value: AiCredentialProvider; label: string }[] = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'mistral', label: 'Mistral' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai_compatible', label: 'Service compatible OpenAI' },
  { value: 'local', label: 'Modèle local (Ollama, vLLM)' },
];

/** BR-IA-04, ADR-0154 point 4 — hosted providers whose data is processed outside the EU. */
const OUTSIDE_EU_PROVIDERS: readonly AiCredentialProvider[] = ['anthropic', 'openai', 'deepseek'];

function needsBaseUrl(provider: AiCredentialProvider): boolean {
  return provider === 'openai_compatible' || provider === 'local';
}

function isOutsideEu(provider: AiCredentialProvider): boolean {
  return OUTSIDE_EU_PROVIDERS.includes(provider);
}

function capabilitiesLabel(ids: readonly AiTaskCapabilityId[]): string {
  return ids.map((id) => t.capabilities[id]).join(', ');
}

/** « 1,50 $ » from the six-decimal USD amount of the contract (BR-IA-07). */
export function usdLabel(amount: string): string {
  const value = Number(amount);
  return `${(Number.isFinite(value) ? value : 0).toFixed(2).replace('.', ',')} $`;
}

function statusTone(status: AiProviderCard['status']): 'green' | 'orange' | 'neutral' {
  if (status === 'qualified') return 'green';
  if (status === 'unqualified') return 'orange';
  return 'neutral';
}

/** EF-1 — the two mockup notes only apply to personal models (provided search and citations are
 * handled by the platform). */
const TASK_NOTES: Partial<Record<AiModelsTaskId, string>> = {
  programme: t.taskNotes.programme,
  course: t.taskNotes.course,
};

function failureMessage(card: AiProviderCard): string | null {
  if (card.failure === null) return null;
  if (card.failure.step === 'bricks' && card.failure.brickType !== null) {
    return t.failureBrick(
      fr.bricks.type(card.failure.brickType as Parameters<typeof fr.bricks.type>[0]),
    );
  }
  return t.failureStep(t.steps[card.failure.step]);
}

export interface AiModelsTabProps {
  initial: AiModelsState | null;
  initialError: boolean;
  requestId?: string;
}

/** SCR-15, onglet Modèles d'IA — tâches, fournisseurs et qualification (SPEC-709 EF-1 to EF-5). */
export function AiModelsTab({ initial, initialError, requestId }: Readonly<AiModelsTabProps>) {
  const [state, setState] = useState<AiModelsState | null>(initial);
  const [error, setError] = useState<string | null>(initialError ? t.errorTitle : null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    const next = await api.meAiModelsGet({});
    setState(next);
    setError(null);
  }, []);

  const retry = (): void => {
    setError(null);
    void refresh().catch(() => {
      setError(t.errorTitle);
    });
  };

  const assign = async (task: AiModelsTaskId, option: AiTaskModelState['options'][number]) => {
    if (pending !== null) return;
    setPending(`task-${task}`);
    setError(null);
    setStatus(null);
    try {
      const next = await api.meAiModelsUpdate({
        body: {
          action: 'assign',
          task,
          modelId: option.modelId,
          credentialId: option.credentialId,
        },
      });
      setState(next);
      setStatus(t.assignmentDone);
    } catch (cause) {
      try {
        await refresh();
      } catch {
        // The current state stays on screen; the error remains actionable.
      }
      setError(cause instanceof ApiError ? cause.detail : t.saveError);
    } finally {
      setPending(null);
    }
  };

  const resetModels = async (): Promise<void> => {
    if (pending !== null) return;
    setPending('reset');
    setError(null);
    setStatus(null);
    try {
      const next = await api.meAiModelsUpdate({ body: { action: 'reset' } });
      setState(next);
      setStatus(t.resetDone);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.detail : t.saveError);
    } finally {
      setPending(null);
    }
  };

  const retest = async (card: AiProviderCard): Promise<void> => {
    if (card.id === null || pending !== null) return;
    setPending(card.id);
    setError(null);
    setStatus(null);
    try {
      // EF-3 — « Tester à nouveau » replays the battery of every model of the key; a failed report
      // is a normal 200 answer and keeps the card (CL-5).
      for (const modelId of card.models) {
        await api.meAiCredentialsQualify({ params: { id: card.id }, body: { modelId } });
      }
      await refresh();
      setStatus(t.assignmentDone);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.detail : t.testError);
    } finally {
      setPending(null);
    }
  };

  const removeKey = async (card: AiProviderCard): Promise<void> => {
    if (card.id === null || pending !== null) return;
    setPending(card.id);
    setError(null);
    setStatus(null);
    try {
      // CL-4 — the service removes the task assignments of the key in the same transaction.
      await api.meAiCredentialsDelete({ params: { id: card.id } });
      await refresh();
      setStatus(t.deleted);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.detail : t.saveError);
    } finally {
      setPending(null);
    }
  };

  if (state === null) {
    return (
      <Card as="section" data-testid="ai-models-panel">
        {error === null ? (
          <p className="m-0 text-14 text-ink-muted" data-testid="ai-models-loading">
            {t.loading}
          </p>
        ) : (
          <ErrorState
            data-testid="ai-models-error-state"
            title={error}
            {...(requestId === undefined ? {} : { requestId })}
            onRetry={retry}
          />
        )}
      </Card>
    );
  }

  const busy = pending !== null;

  return (
    <div className="flex flex-col gap-24" data-testid="ai-models-panel">
      <section
        aria-label={t.tasksTitle}
        className="flex flex-wrap items-center gap-20 rounded-24 bg-ink px-28 py-24 text-white"
        data-testid="ai-models-principle"
      >
        <p className="m-0 flex-[1_1_420px] font-display text-22 font-600 leading-1.3">
          {t.principle}
        </p>
        <ul className="m-0 flex flex-[1_1_320px] list-none flex-col gap-8 p-0 text-14 text-on-dark-secondary">
          {t.principlePoints.map((point) => (
            <li className="flex items-center gap-10" key={point}>
              <span
                aria-hidden
                className="inline-flex size-22 items-center justify-center rounded-7 bg-lime font-700 text-ink"
              >
                ✓
              </span>
              {point}
            </li>
          ))}
        </ul>
      </section>

      <Card as="section" className="p-8" data-testid="ai-models-tasks">
        <div className="flex flex-wrap items-center justify-between gap-12 px-16 pb-10 pt-16">
          <div className="flex flex-col gap-4">
            <h2 className="m-0 font-display text-22 font-600 tracking-title">{t.tasksTitle}</h2>
            <p className="m-0 text-14 text-ink-muted">{t.tasksSubtitle}</p>
          </div>
          <Button
            data-testid="ai-reset-models"
            disabled={busy}
            onClick={() => {
              void resetModels();
            }}
            variant="outline"
          >
            {t.reset}
          </Button>
        </div>
        <ul className="m-0 flex list-none flex-col gap-6 p-0" data-testid="ai-models-task-list">
          {state.tasks.map((task) => (
            <TaskRow
              busy={busy}
              key={task.task}
              onAssign={(option) => {
                void assign(task.task, option);
              }}
              task={task}
            />
          ))}
        </ul>
      </Card>

      <section aria-labelledby="ai-providers-title" className="flex flex-col gap-12">
        <div className="flex flex-col gap-2">
          <h2 className="m-0 font-display text-22 font-600 tracking-title" id="ai-providers-title">
            {t.providersTitle}
          </h2>
          <p className="m-0 text-13 text-ink-muted">
            {t.guard(usdLabel(state.guard.managedDailyCapUsd))}
          </p>
        </div>
        <div className="flex flex-wrap gap-12" data-testid="ai-providers-cards">
          {state.providers.map((card) => (
            <ProviderCardView
              busy={busy}
              card={card}
              key={card.id ?? 'provided'}
              onDelete={() => {
                void removeKey(card);
              }}
              onRetest={() => {
                void retest(card);
              }}
              pending={pending === (card.id ?? 'provided')}
            />
          ))}
          {formOpen ? null : (
            <button
              className="flex min-h-160 flex-[1_1_260px] cursor-pointer flex-col items-center justify-center gap-10 rounded-22 border-2 border-dashed border-border-strong bg-transparent font-[inherit] text-ink"
              data-testid="provider-add"
              onClick={() => {
                setFormOpen(true);
              }}
              type="button"
            >
              <span
                aria-hidden
                className="inline-flex size-44 items-center justify-center rounded-14 bg-ink text-18 font-700 text-lime"
              >
                +
              </span>
              <span className="text-15 font-700">{t.addProvider}</span>
            </button>
          )}
        </div>

        {formOpen ? (
          <AddProviderForm
            onClose={() => {
              setFormOpen(false);
            }}
            onSaved={() => {
              setFormOpen(false);
              void refresh().catch(() => {
                setError(t.errorTitle);
              });
            }}
          />
        ) : null}
      </section>

      {error === null ? null : (
        <div className="flex flex-wrap items-center justify-end gap-12">
          <FormError data-testid="ai-models-error">{error}</FormError>
          <Button data-testid="ai-models-retry" onClick={retry} size="sm" variant="outline">
            {fr.settings.notificationsTab.retry}
          </Button>
        </div>
      )}
      <p aria-live="polite" className="sr-only" data-testid="ai-models-status">
        {status}
      </p>
    </div>
  );
}

interface TaskRowProps {
  task: AiTaskModelState;
  busy: boolean;
  onAssign: (option: AiTaskModelState['options'][number]) => void;
}

/** EF-1, EF-2 — one task line: label, required capabilities, selector and pills. */
function TaskRow({ task, busy, onAssign }: Readonly<TaskRowProps>) {
  const selectId = useId();
  const label = t.taskLabels[task.task];
  const note = task.origin === 'personal' ? TASK_NOTES[task.task] : undefined;
  const selectedIndex = task.options.findIndex(
    (option) =>
      option.modelId === task.modelId &&
      option.credentialId === task.credentialId &&
      option.origin === task.origin,
  );
  const value = selectedIndex >= 0 ? String(selectedIndex) : '';

  return (
    <li
      className="flex flex-wrap items-center gap-x-20 gap-y-12 rounded-18 bg-surface-subtle px-16 py-14"
      data-testid={`ai-task-${task.task}`}
    >
      <span className="flex flex-[1_1_260px] flex-col gap-4">
        <label className="text-15 font-700" htmlFor={selectId}>
          {label}
        </label>
        <span className="text-13 text-ink-muted">
          {t.required(capabilitiesLabel(task.requiredCapabilities))}
        </span>
        {note === undefined ? null : (
          <span className="text-13 font-600 text-indigo-ink-strong">{note}</span>
        )}
      </span>
      <Select
        className="flex-[0_1_300px]"
        data-testid="ai-task-model"
        disabled={busy}
        hideLabel
        id={selectId}
        label={label}
        onChange={(event) => {
          const option = task.options[Number(event.target.value)];
          if (option !== undefined) onAssign(option);
        }}
        options={[
          ...(value === '' ? [{ value: '', label: t.unavailable }] : []),
          ...task.options.map((option, index) => ({
            value: String(index),
            label: option.label,
          })),
        ]}
        value={value}
      />
      <span className="flex min-w-150 flex-wrap gap-6">
        <Badge tone={task.selection === 'default' ? 'default-model' : 'indigo'}>
          {task.selection === 'default' ? t.defaultPill : t.customPill}
        </Badge>
        {task.outsideEu ? <Badge tone="orange">{t.outsideEuPill}</Badge> : null}
      </span>
      {task.available ? null : (
        <p className="m-0 w-full text-13 font-600 text-orange-ink" role="status">
          {t.unavailable} {t.unavailableHint}
        </p>
      )}
    </li>
  );
}

interface ProviderCardViewProps {
  card: AiProviderCard;
  busy: boolean;
  pending: boolean;
  onRetest: () => void;
  onDelete: () => void;
}

function ProviderCardView({
  card,
  busy,
  pending,
  onRetest,
  onDelete,
}: Readonly<ProviderCardViewProps>) {
  const failure = failureMessage(card);
  return (
    <Card
      as="article"
      className="flex min-w-260 flex-[1_1_260px] flex-col gap-10"
      data-testid="provider-card"
      padding="sm"
      radius={22}
    >
      <div className="flex items-center justify-between gap-8">
        <h3 className="m-0 text-17 font-700">{card.label}</h3>
        <Badge tone={card.origin === 'provided' ? 'lime' : statusTone(card.status)}>
          {card.origin === 'provided' ? t.providedBadge : t.status[card.status]}
        </Badge>
      </div>
      {card.origin === 'provided' ? (
        <>
          <p className="m-0 text-14 text-ink-muted">{card.dataNote}</p>
          <p className="m-0 text-13 text-ink-muted">{t.providedModels}</p>
        </>
      ) : (
        <>
          <p className="m-0 text-14 text-ink-muted">
            {card.keyMasked === null ? t.noKey : t.yourKey(card.keyMasked)}
          </p>
          {card.outsideEu ? (
            <p
              className="m-0 rounded-10 bg-orange-soft px-10 py-8 text-13 font-600 text-orange-ink"
              data-region-warning
              data-testid="provider-region-warning"
            >
              {t.regionWarning}
            </p>
          ) : null}
          {failure === null ? null : (
            <p className="m-0 text-13 leading-1.5 text-ink-muted" role="status">
              {failure}
            </p>
          )}
          <div className="flex flex-wrap gap-8">
            <Button
              data-testid="provider-retest"
              disabled={busy}
              onClick={onRetest}
              size="sm"
              variant={card.status === 'qualified' ? 'outline' : 'dark'}
            >
              {pending ? t.retesting : card.status === 'qualified' ? t.retest : t.relance}
            </Button>
            <Button
              data-testid="provider-delete"
              disabled={busy}
              onClick={onDelete}
              size="sm"
              variant="ghost"
            >
              {pending ? t.deleting : t.deleteKey}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

interface AddProviderFormProps {
  onClose: () => void;
  onSaved: () => void;
}

/** EF-3, EF-4 — type, model, endpoint and key; the region warning appears before any submit. */
function AddProviderForm({ onClose, onSaved }: Readonly<AddProviderFormProps>) {
  const [provider, setProvider] = useState<AiCredentialProvider>('mistral');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const qualification = useCredentialQualification({
    provider,
    apiKey,
    baseUrl,
    model,
    recommendedModels: [],
    onKeyAccepted: () => {
      // BR-IA-03 — the field is cleared as soon as the key exists server-side.
      setApiKey('');
    },
  });
  const report = qualification.report;
  const testing = qualification.status === 'testing';
  const tested = report !== null;

  const submit = (): void => {
    setFormError(null);
    if (provider !== 'local' && apiKey.trim() === '') {
      setFormError(t.formIncomplete);
      return;
    }
    if (model.trim() === '') {
      setFormError(t.formIncomplete);
      return;
    }
    void qualification.test();
  };

  return (
    <Card
      as="section"
      className="flex flex-col gap-16 border-ink"
      data-testid="provider-form"
      labelledBy="ai-provider-form-title"
    >
      <h3 className="m-0 font-display text-20 font-600" id="ai-provider-form-title">
        {t.formTitle}
      </h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-14">
        <Select
          data-testid="provider-form-type"
          disabled={testing || tested}
          label={t.formProvider}
          onChange={(event) => {
            setProvider(event.target.value as AiCredentialProvider);
            setFormError(null);
          }}
          options={PROVIDER_OPTIONS.map((entry) => ({ ...entry }))}
          value={provider}
        />
        <TextField
          data-testid="provider-form-model"
          disabled={testing || tested}
          label={t.formModel}
          onChange={(event) => {
            setModel(event.target.value);
            setFormError(null);
          }}
          placeholder={t.formModelPlaceholder}
          value={model}
        />
        {needsBaseUrl(provider) ? (
          <TextField
            data-testid="provider-form-url"
            disabled={testing || tested}
            label={t.formUrl}
            onChange={(event) => {
              setBaseUrl(event.target.value);
            }}
            placeholder={t.formUrlPlaceholder}
            type="url"
            value={baseUrl}
          />
        ) : null}
        {provider === 'local' ? null : (
          <TextField
            autoComplete="off"
            data-testid="provider-form-key"
            disabled={testing || tested}
            label={t.formKey}
            onChange={(event) => {
              setApiKey(event.target.value);
              setFormError(null);
            }}
            placeholder={t.formKeyPlaceholder}
            type="password"
            value={apiKey}
          />
        )}
      </div>
      {isOutsideEu(provider) ? (
        <p
          className="m-0 rounded-12 bg-orange-soft px-12 py-10 text-13 font-600 text-orange-ink"
          data-region-warning
          data-testid="provider-region-warning"
        >
          {t.regionWarning}
        </p>
      ) : null}
      {formError === null ? null : (
        <FormError data-testid="provider-form-error">{formError}</FormError>
      )}
      {testing ? (
        <p aria-live="polite" className="m-0 text-14 text-ink-muted" role="status">
          {t.qualifRunning}
        </p>
      ) : null}
      {report === null ? null : <QualificationResult report={report} />}
      <div className="flex flex-wrap justify-end gap-8">
        <Button
          data-testid="provider-form-cancel"
          disabled={testing}
          onClick={() => {
            qualification.reset();
            onClose();
          }}
          variant="ghost"
        >
          {t.cancel}
        </Button>
        {tested ? (
          <Button data-testid="provider-save" onClick={onSaved} variant="lime">
            {t.saveProvider}
          </Button>
        ) : (
          <Button
            data-testid="provider-qualify"
            disabled={testing}
            loading={testing}
            onClick={submit}
            variant="dark"
          >
            {t.testAndQualify}
          </Button>
        )}
      </div>
    </Card>
  );
}

function QualificationResult({ report }: Readonly<{ report: QualificationReport }>) {
  const failedBrick = report.bricks.find((brick) => brick.status === 'failed');
  const failedStep = report.steps.find((step) => step.status === 'failed');
  return (
    <div
      className="flex flex-col gap-10 rounded-18 bg-canvas px-18 py-16"
      data-testid="provider-qualification-result"
    >
      <p className="m-0 text-14 font-700">{t.resultTitle}</p>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-8 p-2 text-14">
        {report.steps.map((step) => (
          <li className="flex items-center gap-8" key={step.step}>
            <span
              aria-hidden
              className={cn(
                'inline-flex size-20 items-center justify-center rounded-full text-10 font-700 text-white',
                step.status === 'passed' ? 'bg-green' : 'bg-orange-ink',
              )}
            >
              {step.status === 'passed' ? '✓' : '×'}
            </span>
            {t.steps[step.step]} — {t.stepStatus[step.status]}
          </li>
        ))}
      </ul>
      <p
        className={cn(
          'm-0 text-13 font-700',
          report.status === 'qualified' ? 'text-green-ink' : 'text-orange-ink',
        )}
        role="status"
      >
        {report.status === 'qualified' ? t.qualifPassed : t.qualifFailed}
      </p>
      {failedBrick === undefined ? null : (
        <p className="m-0 text-13 text-ink-muted">
          {t.failureBrick(fr.bricks.type(failedBrick.type as Parameters<typeof fr.bricks.type>[0]))}
        </p>
      )}
      {failedStep === undefined || failedStep.step === 'bricks' ? null : (
        <p className="m-0 text-13 text-ink-muted">{t.failureStep(t.steps[failedStep.step])}</p>
      )}
    </div>
  );
}
