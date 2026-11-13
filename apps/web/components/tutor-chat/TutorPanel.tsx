'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { MarkdownContent } from '@learny/bricks/view';
import type { ContextItemDto, ConversationSummaryDto, FollowUpDto } from '@learny/contracts';

import { fr } from '../../messages/fr';

import {
  dataOf,
  pendingSelfTestOf,
  textOf,
  type TutorChatState,
  type TutorUiMessage,
} from './use-tutor-chat';

const t = fr.tutorChat;

const DOT: Record<ContextItemDto['key'], string> = {
  formation: 'bg-indigo',
  chapter: 'bg-ink',
  passage: 'bg-lime',
  resources: 'bg-green',
  gap: 'bg-orange',
  profile: 'bg-on-dark-muted',
};

function Sparkle(): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
      width="18"
    >
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
    </svg>
  );
}

function contextCount(items: readonly ContextItemDto[]): number {
  return items.filter((item) => item.included).length;
}

function dateLabel(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  })
    .format(new Date(iso))
    .replace(':', 'h');
}

function ContextList({ state }: { state: TutorChatState }): React.ReactElement {
  const [expanded, setExpanded] = useState(true);
  if (state.contextItems.length === 0) return <></>;
  return (
    <div className="border-b border-divider bg-surface-weekend px-16 py-10">
      <button
        aria-controls="contexte-tuteur"
        aria-expanded={expanded}
        className="flex min-h-36 w-full cursor-pointer items-center gap-10 border-0 bg-transparent px-2 text-left text-ink"
        data-testid="tutor-context-toggle"
        onClick={() => {
          setExpanded((value) => !value);
        }}
        type="button"
      >
        <span className="text-13 font-700">{t.contextTitle}</span>
        <span
          className="rounded-full bg-ink px-8 py-2 text-11 font-700 text-lime"
          data-testid="tutor-context-count"
        >
          {t.contextCount(contextCount(state.contextItems))}
        </span>
        <svg
          aria-hidden="true"
          fill="none"
          height="14"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.2"
          viewBox="0 0 24 24"
          width="14"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {expanded ? (
        <>
          <ul className="m-0 mt-6 mb-4 flex list-none flex-col gap-6 p-0" id="contexte-tuteur">
            {state.contextItems.map((item) => (
              <li
                className={`flex items-center gap-10 rounded-12 border border-divider p-8 ${item.included ? 'bg-surface' : 'bg-surface-muted'}`}
                data-key={item.key}
                data-testid="tutor-context-item"
                key={item.key}
              >
                <span
                  aria-hidden="true"
                  className={`h-8 w-8 flex-none rounded-full ${DOT[item.key]}`}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-11 font-700 tracking-label text-ink-muted uppercase">
                    {item.label}
                  </span>
                  <span className="text-13 leading-1.4">{item.value}</span>
                </span>
                <button
                  aria-label={`${item.included ? t.contextIncluded : t.contextRetired} · ${item.included ? t.contextRemove(item.label) : t.contextRestore(item.label)}`}
                  aria-pressed={item.included}
                  className={`min-h-28 flex-none cursor-pointer rounded-full px-10 text-12 font-700 ${
                    item.included
                      ? 'border-0 bg-ink text-white'
                      : 'border border-border-strong bg-surface text-ink-secondary'
                  }`}
                  onClick={() => {
                    state.toggleContext(item.key);
                  }}
                  type="button"
                >
                  {item.included ? t.contextIncluded : t.contextRetired}
                </button>
              </li>
            ))}
          </ul>
          <p className="m-0 mb-1 text-12 leading-1.45 text-ink-muted">{t.contextHint}</p>
        </>
      ) : null}
    </div>
  );
}

function Message({
  message,
  last,
  streaming,
  onFollowUp,
  onRetry,
}: {
  message: TutorUiMessage;
  last: boolean;
  streaming: boolean;
  onFollowUp: (followUp: FollowUpDto) => void;
  onRetry: () => void;
}): React.ReactElement {
  const text = textOf(message);
  if (message.role === 'user') {
    return (
      <div
        className="max-w-[85%] self-end rounded-[16px_4px_16px_16px] bg-ink px-14 py-10 text-14 leading-1.5 text-white"
        data-role="learner"
        data-testid="tutor-message"
      >
        {text}
      </div>
    );
  }
  const sources =
    (dataOf(message, 'data-sources') as { sources: { label: string }[] } | null)?.sources ?? [];
  const followUps =
    (dataOf(message, 'data-follow-ups') as { followUps: FollowUpDto[] } | null)?.followUps ?? [];
  const error = text === '' && dataOf(message, 'data-self-test') !== null;
  return (
    <div
      className="flex max-w-full items-start gap-10"
      data-role="tutor"
      data-testid="tutor-message"
    >
      <span
        aria-hidden="true"
        className="flex h-28 w-28 flex-none items-center justify-center rounded-9 bg-lime"
      >
        <Sparkle />
      </span>
      <div className="flex min-w-0 flex-col gap-8">
        <div className="flex flex-col gap-8 rounded-[4px_16px_16px_16px] bg-surface-muted px-14 py-12 text-14 leading-1.55 text-ink">
          <MarkdownContent markdown={text} />
          {sources.length > 0 ? (
            <span className="text-12 text-ink-muted" data-testid="tutor-sources">
              {t.sources(sources.map((source) => source.label).join(' · '))}
            </span>
          ) : null}
          {error ? (
            <span className="text-13 text-danger" role="alert">
              {t.interrupted}{' '}
              <button className="cursor-pointer underline" onClick={onRetry} type="button">
                {t.retry}
              </button>
            </span>
          ) : null}
        </div>
        {last && !streaming && followUps.length > 0 ? (
          <div className="flex flex-wrap gap-6">
            {followUps.map((followUp) => (
              <button
                className="min-h-32 cursor-pointer rounded-full border border-border-strong bg-surface px-12 text-13 font-600 text-ink"
                data-testid="tutor-follow-up"
                key={followUp.key}
                onClick={() => {
                  onFollowUp(followUp);
                }}
                type="button"
              >
                {followUp.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function TutorPanel({
  state,
  chapterTitle,
  draft,
  onDraft,
  onClose,
  onSend,
  onFollowUp,
  onNewDiscussion,
}: {
  state: TutorChatState;
  chapterTitle: string;
  draft: string;
  onDraft: (value: string) => void;
  onClose: () => void;
  onSend: () => void;
  onFollowUp: (followUp: FollowUpDto) => void;
  onNewDiscussion: () => void;
}): React.ReactElement {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const pending = pendingSelfTestOf(state.messages);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    if (box !== null) box.scrollTop = box.scrollHeight;
  }, [state.messages, state.streaming]);

  return (
    <section
      aria-labelledby="t-chat"
      aria-modal="false"
      className="fixed top-0 right-0 bottom-0 z-dialog flex w-460 max-w-full flex-col border-l border-border bg-surface shadow-drawer max-[599px]:w-full"
      data-testid="tutor-panel"
      id="chat-tuteur"
      role="dialog"
    >
      <div className="flex items-center gap-12 border-b border-divider px-18 py-14">
        <span
          aria-hidden="true"
          className="flex h-38 w-38 flex-none items-center justify-center rounded-12 bg-lime"
        >
          <Sparkle />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="m-0 font-display text-18 font-600" id="t-chat">
            {t.panelTitle}
          </h2>
          <span className="truncate text-12 text-ink-muted">{t.panelSubtitle(chapterTitle)}</span>
        </div>
        <div className="ml-auto flex gap-4">
          <button
            className="min-h-36 cursor-pointer rounded-10 border border-border bg-surface px-10 text-13 font-600 text-ink"
            data-testid="tutor-reset"
            onClick={onNewDiscussion}
            type="button"
          >
            {t.newDiscussion}
          </button>
          <button
            aria-label={t.close}
            className="h-36 w-36 cursor-pointer rounded-10 bg-transparent text-22 leading-1 text-ink-muted"
            data-testid="tutor-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
      </div>
      {state.history.length > 0 ? (
        <div className="border-b border-divider px-16 py-6">
          <button
            aria-expanded={state.historyOpen}
            className="cursor-pointer bg-transparent text-12 font-600 text-ink-muted underline"
            onClick={() => {
              state.setHistoryOpen(!state.historyOpen);
            }}
            type="button"
          >
            {t.previous(state.history.length)}
          </button>
          {state.historyOpen ? (
            <ul className="m-0 mt-6 flex list-none flex-col gap-4 p-0" data-testid="tutor-history">
              {state.history.map((entry: ConversationSummaryDto) => (
                <li key={entry.id}>
                  <button
                    className="w-full cursor-pointer rounded-8 px-8 py-4 text-left text-12 text-ink hover:bg-surface-muted"
                    onClick={() => {
                      void state.loadConversation(entry.id);
                      state.setHistoryOpen(false);
                    }}
                    type="button"
                  >
                    <span className="block truncate">{entry.title ?? t.newDiscussion}</span>
                    <span className="text-11 text-ink-muted">{dateLabel(entry.lastMessageAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <ContextList state={state} />
      <div
        aria-live="polite"
        className="flex min-h-0 flex-1 flex-col gap-14 overflow-y-auto px-16 py-18"
        data-testid="tutor-messages"
        id="chat-messages"
        ref={boxRef}
      >
        {state.messages.map((message, index) => (
          <Message
            key={message.id}
            last={index === state.messages.length - 1}
            message={message}
            onFollowUp={onFollowUp}
            onRetry={() => {
              void state.retry();
            }}
            streaming={state.streaming}
          />
        ))}
        {state.fatalError === 'AI_UNAVAILABLE' ? (
          <div
            className="rounded-16 bg-orange-soft p-12 text-13 text-orange-ink-strong"
            role="alert"
          >
            <p className="m-0">{t.errorUnavailable}</p>
            <Link
              className="mt-4 inline-block text-13 font-700 underline"
              href="/parametres#modeles"
            >
              {t.configureModels}
            </Link>
          </div>
        ) : null}
        {state.streaming ? (
          <div
            className="flex items-center gap-10 text-13 text-ink-muted"
            data-testid="tutor-typing"
          >
            <span aria-hidden="true" className="h-28 w-28 flex-none rounded-9 bg-lime-soft" />
            {t.typing}
          </div>
        ) : null}
        {state.sendError === null ? null : (
          <p
            className="m-0 rounded-12 bg-orange-soft p-10 text-13 text-orange-ink-strong"
            role="alert"
          >
            {state.sendError}{' '}
            <button
              className="cursor-pointer underline"
              onClick={() => void state.retry()}
              type="button"
            >
              {t.retry}
            </button>
          </p>
        )}
      </div>
      <div className="flex flex-col gap-6 border-t border-divider px-16 py-12">
        <div className="flex items-end gap-8 rounded-16 border border-border-strong bg-surface p-6">
          <label className="sr-only" htmlFor="chat-input">
            {t.inputLabel}
          </label>
          <textarea
            className="min-w-0 flex-1 resize-none border-0 bg-transparent p-8 text-14 leading-1.45 text-ink outline-none"
            data-testid="tutor-input"
            id="chat-input"
            onChange={(event) => {
              onDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            placeholder={t.placeholder}
            ref={inputRef}
            rows={2}
            value={draft}
          />
          <button
            aria-label={t.send}
            className="flex h-40 w-40 flex-none cursor-pointer items-center justify-center rounded-11 bg-ink text-white disabled:opacity-60"
            data-testid="tutor-send"
            disabled={state.streaming || draft.trim() === ''}
            onClick={onSend}
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="16"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.2"
              viewBox="0 0 24 24"
              width="16"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
        <span className="text-11 text-ink-muted">{t.keyboardHelp}</span>
      </div>
      {pending ? null : null}
    </section>
  );
}
