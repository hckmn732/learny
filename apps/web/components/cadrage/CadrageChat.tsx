'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';

import {
  CADRAGE_RUBRIC_KEYS,
  type CadrageProfile,
  type CadrageRubricKey,
  type CadrageStateDto,
  type CadrageSuggestion,
} from '@learny/contracts';
import { AppError } from '@learny/core';

import { api } from '../../lib/api-client';
import { fr } from '../../messages/fr';

import { CadrageSteps } from './CadrageSteps';
import { ChatMessage } from './ChatMessage';
import { FormationProfilePanel } from './FormationProfilePanel';
import { ReplyBar, composeReplyContent } from './ReplyBar';
import { SuggestionGroup } from './SuggestionGroup';
import { useCadrage } from './use-cadrage';

const t = fr.cadrage;

function emptyProfile(): CadrageProfile {
  return Object.fromEntries(
    CADRAGE_RUBRIC_KEYS.map((key) => [key, { value: null, state: 'todo' }]),
  ) as CadrageProfile;
}

function errorText(code: string | undefined): string {
  switch (code) {
    case 'AI_UNAVAILABLE':
      return t.errors.AI_UNAVAILABLE;
    case 'AI_TASK_FAILED':
      return t.errors.AI_TASK_FAILED;
    case 'RATE_LIMITED':
      return t.errors.RATE_LIMITED;
    case 'AI_RATE_LIMITED':
      return t.errors.AI_RATE_LIMITED;
    case 'NETWORK_ERROR':
      return t.errors.NETWORK_ERROR;
    case 'CONFLICT':
      return t.errors.CONFLICT;
    case 'CADRAGE_INCOMPLETE':
      return t.completeForbidden;
    default:
      return t.errors.GENERIC;
  }
}

function TypingBubble() {
  return (
    <div aria-live="polite" className="flex items-center gap-12" data-testid="cadrage-typing">
      <span
        aria-hidden="true"
        className="flex h-36 w-36 shrink-0 items-center justify-center rounded-12 bg-lime"
      >
        <span className="h-8 w-8 rounded-full bg-ink" />
      </span>
      <div
        className="flex items-center gap-6 bg-surface-muted px-16 py-14 text-15 text-ink-muted"
        style={{ borderRadius: '4px 18px 18px 18px' }}
      >
        <span>{t.thinking}</span>
        {[0, 1, 2].map((index) => (
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-pulse rounded-full bg-ink-muted motion-reduce:animate-none"
            key={index}
            style={{ animationDelay: `${String(index * 150)}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

interface CadrageLayoutProps {
  title: string;
  onTitleChange: (value: string) => void;
  onTitleBlur?: () => void;
  titleError?: string | null;
  titleDisabled?: boolean;
  log: ReactNode;
  footer: ReactNode;
  profile: CadrageProfile;
  questionsAsked: number;
  finished: boolean;
  canGenerate: boolean;
  preview?: Partial<Record<CadrageRubricKey, string>>;
  generating?: boolean;
  onGenerate?: () => void;
}

function CadrageLayout({
  title,
  onTitleChange,
  onTitleBlur,
  titleError = null,
  titleDisabled = false,
  log,
  footer,
  profile,
  questionsAsked,
  finished,
  canGenerate,
  preview,
  generating = false,
  onGenerate,
}: CadrageLayoutProps) {
  return (
    <main className="mx-auto w-full max-w-content px-16 pb-40 shell:px-40">
      <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-24">
        <CadrageSteps />
        <div className="flex flex-wrap items-start gap-20">
          <section
            aria-label={t.dialogueLabel}
            className="flex min-w-0 flex-[999_1_560px] flex-col overflow-hidden rounded-28 border border-border bg-surface"
            data-testid="cadrage-chat"
          >
            <div className="flex flex-col gap-8 border-b border-divider px-28 py-24">
              <label
                className="text-12 font-700 tracking-eyebrow text-ink-muted uppercase"
                htmlFor="cadrage-title-input"
              >
                {t.subjectLabel}
              </label>
              <input
                className="min-h-52 border-0 bg-transparent p-0 font-display text-30 font-600 tracking-heading text-ink outline-none placeholder:text-ink-muted disabled:opacity-70"
                data-testid="cadrage-title-input"
                disabled={titleDisabled}
                id="cadrage-title-input"
                maxLength={120}
                onBlur={onTitleBlur}
                onChange={(event) => {
                  onTitleChange(event.target.value);
                }}
                placeholder={t.subjectPlaceholder}
                type="text"
                value={title}
              />
              {title.length >= 120 ? (
                <span className="self-end text-12 text-ink-muted">
                  {t.subjectCounter(title.length, 120)}
                </span>
              ) : null}
              {titleError === null ? null : (
                <p className="m-0 text-13 font-600 text-orange-ink" role="alert">
                  {titleError}
                </p>
              )}
            </div>
            {log}
            {footer}
          </section>

          <aside
            aria-labelledby="t-profil"
            className="flex flex-[1_1_320px] flex-col gap-16"
            data-testid="cadrage-profile"
          >
            <FormationProfilePanel
              canGenerate={canGenerate}
              finished={finished}
              generating={generating}
              onGenerate={onGenerate}
              preview={preview}
              profile={profile}
              questionsAsked={questionsAsked}
            />
            <p className="m-0 rounded-20 border border-border bg-surface px-18 py-16 text-13 leading-1.55 text-ink-muted">
              {t.note}
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}

function ErrorAlert({
  code,
  onRetry,
}: Readonly<{ code: string; onRetry?: (() => void) | undefined }>) {
  return (
    <div
      className="rounded-16 border border-solid border-orange-ink/40 bg-orange-soft px-16 py-14 text-14 text-orange-ink-strong"
      data-testid="cadrage-error"
      role="alert"
    >
      <p className="m-0">{errorText(code)}</p>
      {code === 'AI_UNAVAILABLE' ? (
        <a className="mt-8 inline-block font-600" href="/parametres#modeles">
          {t.settingsLink}
        </a>
      ) : null}
      {onRetry === undefined ? null : (
        <button
          className="mt-8 cursor-pointer rounded-10 border border-solid border-orange-ink bg-transparent px-12 py-6 text-13 font-600 text-orange-ink"
          data-testid="cadrage-retry"
          onClick={onRetry}
          type="button"
        >
          {t.retry}
        </button>
      )}
    </div>
  );
}

export interface NewFormationChatProps {
  initialTitle?: string;
}

/** EF-4 — the subject field and the single “Commencer le cadrage” action. */
export function NewFormationChat({ initialTitle = '' }: NewFormationChatProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: (input: { title: string; key: string }) =>
      api.formationsCreate(
        { body: { title: input.title } },
        { idempotencyKey: input.key },
      ),
    onSuccess: (data) => {
      const suffix =
        data.cadrage.error === null ? '' : `?erreur=${encodeURIComponent(data.cadrage.error.code)}`;
      router.replace(`/formations/${data.formation.id}/cadrage${suffix}`);
      router.refresh();
    },
    onError: (cause) => {
      const code = cause instanceof AppError ? cause.code : 'INTERNAL_ERROR';
      setError(code === 'NETWORK_ERROR' ? t.errors.NETWORK_ERROR : t.createError);
    },
  });

  const start = () => {
    const trimmed = title.trim();
    if (trimmed === '') {
      setError(t.subjectEmpty);
      return;
    }
    setError(null);
    create.mutate({ title: trimmed, key: crypto.randomUUID() });
  };

  return (
    <CadrageLayout
      canGenerate={false}
      finished={false}
      footer={
        <div className="mt-auto border-t border-divider px-20 py-16">
          <button
            className="min-h-52 w-full cursor-pointer rounded-16 border-0 bg-ink px-20 text-15 font-700 text-white hover:bg-dark-700 disabled:cursor-not-allowed disabled:opacity-55"
            data-testid="cadrage-start"
            disabled={create.isPending}
            onClick={start}
            type="button"
          >
            {create.isPending ? t.creating : t.start}
          </button>
        </div>
      }
      log={
        <div
          aria-live="polite"
          className="flex min-h-240 flex-col gap-18 px-28 py-24"
          data-testid="cadrage-log"
          role="log"
        >
          {error === null || error === t.subjectEmpty ? null : (
            <ErrorAlert code={error === t.subjectEmpty ? 'SUBJECT_EMPTY' : 'INTERNAL_ERROR'} />
          )}
        </div>
      }
      onTitleChange={(value) => {
        setTitle(value);
        if (error === t.subjectEmpty) setError(null);
      }}
      profile={emptyProfile()}
      questionsAsked={0}
      title={title}
      titleError={error === t.subjectEmpty ? error : null}
    />
  );
}

export interface CadrageChatProps {
  fid: string;
  initialState: CadrageStateDto;
  creationError?: string | null;
}

/** EF-5 to EF-13 — the conversation, the profile panel and the programme action. */
export function CadrageChat({ fid, initialState, creationError = null }: CadrageChatProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const cadrage = useCadrage(fid, initialState);
  const state = cadrage.state ?? initialState;
  const [title, setTitle] = useState(initialState.title);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creationCode, setCreationCode] = useState<string | null>(creationError);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const replyRef = useRef<HTMLInputElement | null>(null);
  const previousCount = useRef(initialState.messages.length);

  useEffect(() => {
    setTitle(state.title);
  }, [state.title]);

  useEffect(() => {
    setSelected(new Set());
  }, [state.pendingQuestion?.messageId]);

  useEffect(() => {
    if (state.messages.length > previousCount.current) {
      replyRef.current?.focus();
    }
    previousCount.current = state.messages.length;
  }, [state.messages.length]);
  useEffect(() => {
    if (state.messages.length > 0) setCreationCode(null);
  }, [state.messages.length]);

  const patch = useMutation({
    mutationFn: (value: string) =>
      api.formationUpdate({ params: { fid }, body: { title: value } }),
    onSuccess: (data) => {
      setTitle(data.title);
      setTitleError(null);
      queryClient.setQueryData<CadrageStateDto>(['cadrage', fid], (current) =>
        current === undefined ? current : { ...current, title: data.title },
      );
    },
    onError: () => {
      setTitleError(t.titleSaveError);
    },
  });

  const complete = useMutation({
    mutationFn: () => api.cadrageComplete({ params: { fid } }),
    onSuccess: () => {
      queryClient.clear();
      router.push(`/formations/${fid}/programme`);
    },
    onError: (cause) => {
      setCompleteError(cause instanceof AppError ? cause.code : 'INTERNAL_ERROR');
    },
  });

  const pending = state.pendingQuestion;
  const pendingMessage =
    pending === null
      ? undefined
      : state.messages.find((message) => message.id === pending.messageId);
  const suggestions: readonly CadrageSuggestion[] = pendingMessage?.suggestions ?? [];
  const multi = pending?.multi === true;
  const labels = new Map(suggestions.map((item) => [item.value, item.label]));
  const preview: Partial<Record<CadrageRubricKey, string>> =
    multi && pending?.questionKey !== undefined && pending.questionKey !== 'other' && selected.size > 0
      ? {
          [pending.questionKey]: [...selected]
            .map((value) => labels.get(value) ?? value)
            .join(', '),
        }
      : {};

  const errorCode =
    completeError ??
    cadrage.error?.code ??
    state.error?.code ??
    (creationCode === null ? undefined : creationCode) ??
    undefined;
  const errorRetry =
    errorCode === 'AI_TASK_FAILED'
      ? () => {
          setCreationCode(null);
          cadrage.clearError();
          cadrage.retryTutor();
        }
      : errorCode === 'NETWORK_ERROR'
        ? cadrage.retryLast
        : undefined;

  const send = () => {
    const trimmed = text.trim();
    const selectedValues = [...selected];
    if (selectedValues.length > 0 && trimmed !== '') {
      cadrage.sendContent(
        composeReplyContent(
          selectedValues.map((value) => labels.get(value) ?? value),
          trimmed,
        ),
      );
    } else if (selectedValues.length > 0) {
      cadrage.sendSelections(
        selectedValues,
        selectedValues.map((value) => labels.get(value) ?? value).join(', '),
      );
    } else if (trimmed !== '') {
      cadrage.sendContent(trimmed);
    } else {
      return;
    }
    setText('');
    setSelected(new Set());
    setCompleteError(null);
  };

  return (
    <CadrageLayout
      canGenerate={state.canGenerate}
      finished={state.finished}
      footer={
        <ReplyBar
          disabled={cadrage.sending}
          inputRef={replyRef}
          onChange={setText}
          onSend={send}
          selectedCount={selected.size}
          value={text}
        />
      }
      generating={complete.isPending}
      log={
        <div
          aria-live="polite"
          className="flex min-h-240 flex-col gap-18 px-28 py-24"
          data-testid="cadrage-log"
          role="log"
        >
          {state.messages.map((message) => (
            <Fragment key={message.id}>
              <ChatMessage message={message} />
              {pending?.messageId === message.id && suggestions.length > 0 ? (
                <div className="ml-48">
                  <SuggestionGroup
                    disabled={cadrage.sending}
                    multi={multi}
                    onPick={(label) => {
                      cadrage.sendContent(label);
                      setText('');
                      setSelected(new Set());
                    }}
                    onToggle={(value) => {
                      setSelected((current) => {
                        const next = new Set(current);
                        if (next.has(value)) next.delete(value);
                        else next.add(value);
                        return next;
                      });
                    }}
                    selected={selected}
                    suggestions={suggestions}
                  />
                </div>
              ) : null}
            </Fragment>
          ))}
          {cadrage.sending ? <TypingBubble /> : null}
          {errorCode === undefined ? null : <ErrorAlert code={errorCode} onRetry={errorRetry} />}
        </div>
      }
      onGenerate={() => {
        setCompleteError(null);
        complete.mutate();
      }}
      onTitleBlur={() => {
        const trimmed = title.trim();
        if (trimmed === '' || trimmed === state.title) {
          setTitle(state.title);
          setTitleError(null);
          return;
        }
        patch.mutate(trimmed);
      }}
      onTitleChange={setTitle}
      preview={preview}
      profile={state.profile}
      questionsAsked={state.questionsAsked}
      title={title}
      titleError={titleError}
    />
  );
}
