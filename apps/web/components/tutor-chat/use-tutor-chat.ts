'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  ChatContextInput,
  ContextItemDto,
  ConversationDto,
  ConversationSummaryDto,
  FollowUpDto,
  TutorMessageDto,
  TutorSourceDto,
} from '@learny/contracts';

import { api, ApiError } from '../../lib/api-client';
import { fr } from '../../messages/fr';

import type { Selection } from './use-text-selection';

// SPEC-610 ET-9, ADR-0063 — local state of the tutor panel, one hook, no global store. `useChat`
// streams the reply; the transport adds the included context and the optional follow-up. The
// conversation itself (greeting, history, context items) is read from the typed API.

const t = fr.tutorChat;

export type TutorPart =
  | { type: 'text'; text: string }
  | { type: 'data-sources'; data: { sources: TutorSourceDto[] } }
  | { type: 'data-follow-ups'; data: { followUps: FollowUpDto[] } }
  | { type: 'data-self-test'; data: { status: 'pending' | 'answered' } };

export interface TutorUiMessage extends UIMessage {
  parts: TutorPart[];
}

function toUiMessage(message: TutorMessageDto): TutorUiMessage {
  const parts: TutorPart[] = [{ type: 'text', text: message.content }];
  if (message.sources.length > 0)
    parts.push({ type: 'data-sources', data: { sources: message.sources } });
  if (message.followUps.length > 0)
    parts.push({ type: 'data-follow-ups', data: { followUps: message.followUps } });
  if (message.selfTest !== null)
    parts.push({ type: 'data-self-test', data: { status: message.selfTest.status } });
  return { id: message.id, role: message.role === 'learner' ? 'user' : 'assistant', parts };
}

export function textOf(message: TutorUiMessage): string {
  return message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

export function dataOf(message: TutorUiMessage, type: string): unknown {
  const part = message.parts.find((entry) => entry.type === type);
  return part === undefined ? null : ((part as unknown as { data: unknown }).data ?? null);
}

export function pendingSelfTestOf(messages: readonly TutorUiMessage[]): boolean {
  const lastTutor = [...messages].reverse().find((message) => message.role === 'assistant');
  if (lastTutor === undefined) return false;
  return (dataOf(lastTutor, 'data-self-test') as { status?: string } | null)?.status === 'pending';
}

export interface TutorChatState {
  open: boolean;
  setOpen: (value: boolean) => void;
  messages: TutorUiMessage[];
  streaming: boolean;
  conversationId: string | null;
  contextItems: ContextItemDto[];
  include: ChatContextInput['include'];
  toggleContext: (key: ContextItemDto['key']) => void;
  passage: Selection | null;
  setPassage: (value: Selection | null) => void;
  history: ConversationSummaryDto[];
  historyOpen: boolean;
  setHistoryOpen: (value: boolean) => void;
  pendingSelfTest: boolean;
  fatalError: 'AI_UNAVAILABLE' | null;
  sendError: string | null;
  openPanel: () => void;
  closePanel: () => void;
  send: (text: string, followUp?: FollowUpDto['key']) => Promise<void>;
  askPassage: (text: string) => Promise<void>;
  askSelection: () => Promise<void>;
  dismissSelection: () => void;
  newDiscussion: () => Promise<void>;
  loadConversation: (id: string) => Promise<void>;
  retry: () => Promise<void>;
  lastText: string | null;
}

export function useTutorChat(input: {
  courseId: string;
  courseTitle: string;
  chapterId: string;
  chapterTitle: string;
  chapterPosition: number;
}): TutorChatState {
  const [open, setOpenState] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [include, setInclude] = useState<ChatContextInput['include']>({});
  const [contextItems, setContextItems] = useState<ContextItemDto[]>([]);
  const [passage, setPassage] = useState<Selection | null>(null);
  const [history, setHistory] = useState<ConversationSummaryDto[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [fatalError, setFatalError] = useState<'AI_UNAVAILABLE' | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastText, setLastText] = useState<string | null>(null);
  const lastFollowUp = useRef<FollowUpDto['key'] | undefined>(undefined);
  const loaded = useRef(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<TutorUiMessage>({
        api: `/api/v1/conversations/${conversationId ?? '00000000-0000-0000-0000-000000000000'}/messages`,
        prepareSendMessagesRequest: ({ messages, body }) => {
          const last = [...messages].reverse().find((message) => message.role === 'user');
          const text = last === undefined ? '' : textOf(last);
          const extra = (body ?? {}) as {
            context?: ChatContextInput;
            followUp?: FollowUpDto['key'];
          };
          return {
            body: {
              text,
              context: extra.context ?? { include: {} },
              ...(extra.followUp === undefined ? {} : { followUp: extra.followUp }),
            },
          };
        },
      }),
    [conversationId],
  );

  const chat = useChat<TutorUiMessage>({ transport });
  const messages = chat.messages;
  const streaming = chat.status === 'submitted' || chat.status === 'streaming';
  const pendingSelfTest = pendingSelfTestOf(messages);

  const loadConversation = useCallback(
    async (id: string) => {
      const dto = await api.conversationGet({ params: { id } });
      setConversationId(dto.id);
      setContextItems(dto.contextItems);
      setInclude(Object.fromEntries(dto.contextItems.map((item) => [item.key, item.included])));
      setLastText(null);
      chat.setMessages(dto.messages.map(toUiMessage));
    },
    [chat],
  );

  const creating = useRef<Promise<ConversationDto> | null>(null);
  const create = useCallback(async (): Promise<ConversationDto> => {
    if (creating.current !== null) return creating.current;
    const promise = (async (): Promise<ConversationDto> => {
      setFatalError(null);
      const dto = await api.courseConversationCreate(
        { params: { cid: input.courseId }, body: { chapterId: input.chapterId } },
        { idempotencyKey: crypto.randomUUID() },
      );
      setConversationId(dto.id);
      setContextItems(dto.contextItems);
      setInclude(Object.fromEntries(dto.contextItems.map((item) => [item.key, item.included])));
      chat.setMessages(dto.messages.map(toUiMessage));
      return dto;
    })().finally(() => {
      creating.current = null;
    });
    creating.current = promise;
    return promise;
  }, [chat, input.chapterId, input.courseId]);

  const refreshHistory = useCallback(async () => {
    try {
      const list = await api.courseConversationList({ params: { cid: input.courseId } });
      setHistory(list.items);
    } catch {
      setHistory([]);
    }
  }, [input.courseId]);

  const openPanel = useCallback(() => {
    setOpenState(true);
    setHistoryOpen(false);
    if (loaded.current) return;
    loaded.current = true;
    void refreshHistory();
    void create().catch((error: unknown) => {
      if (error instanceof ApiError && error.code === 'AI_UNAVAILABLE')
        setFatalError('AI_UNAVAILABLE');
      else setSendError(error instanceof Error ? error.message : t.errorNetwork);
    });
  }, [create, refreshHistory]);

  const closePanel = useCallback(() => {
    setOpenState(false);
    setHistoryOpen(false);
  }, []);

  const contextOf = useCallback(
    (): ChatContextInput => ({
      include,
      ...(passage === null ? {} : { passage: { text: passage.passageText } }),
    }),
    [include, passage],
  );

  const answerSelfTestCall = useCallback(
    async (id: string, text: string): Promise<void> => {
      // The learner message is already visible locally; the correction is appended after the call.
      chat.setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text }] },
      ]);
      try {
        const result = await api.conversationSelfTestAnswer(
          { params: { id }, body: { text } },
          { idempotencyKey: crypto.randomUUID() },
        );
        chat.setMessages((current) => [...current, toUiMessage(result.message)]);
      } catch (error) {
        setSendError(
          error instanceof ApiError && error.code === 'RATE_LIMITED'
            ? t.errorRate(error.retryAfterSec ?? 1)
            : t.errorNetwork,
        );
      }
    },
    [chat],
  );

  const send = useCallback(
    async (text: string, followUp?: FollowUpDto['key']) => {
      const trimmed = text.trim();
      if (trimmed === '' || streaming) return;
      setSendError(null);
      setLastText(trimmed);
      let id = conversationId;
      if (id === null) {
        try {
          const dto = await create();
          id = dto.id;
        } catch (error) {
          if (error instanceof ApiError && error.code === 'AI_UNAVAILABLE') {
            setFatalError('AI_UNAVAILABLE');
            return;
          }
          setSendError(t.errorNetwork);
          return;
        }
      }
      if (pendingSelfTest) {
        await answerSelfTestCall(id, trimmed);
        return;
      }
      lastFollowUp.current = followUp;
      await chat.sendMessage({ text: trimmed }, { body: { context: contextOf(), followUp } });
      setPassage(null);
    },
    [answerSelfTestCall, chat, contextOf, conversationId, create, pendingSelfTest, streaming],
  );

  const askPassage = useCallback(
    async (text: string) => {
      const selection = {
        text: text.replace(/\s+/g, ' ').trim().slice(0, 1_000),
        preview: text.slice(0, 88),
        passageText: text.slice(0, 1_000),
      };
      setPassage(selection);
      setOpenState(true);
      if (!loaded.current) {
        loaded.current = true;
        await refreshHistory();
        try {
          await create();
        } catch (error) {
          if (error instanceof ApiError && error.code === 'AI_UNAVAILABLE')
            setFatalError('AI_UNAVAILABLE');
          return;
        }
      }
      setInclude((current) => ({ ...current, passage: true }));
      setContextItems((current) =>
        current.some((item) => item.key === 'passage')
          ? current
          : [
              ...current.slice(0, 2),
              {
                key: 'passage',
                label: 'Passage',
                value: `« ${selection.preview} »`,
                included: true,
              },
              ...current.slice(2),
            ],
      );
      await send('Explique-moi ce passage');
    },
    [create, refreshHistory, send],
  );

  const askSelection = useCallback(async () => {
    if (passage === null) return;
    setOpenState(true);
    setInclude((current) => ({ ...current, passage: true }));
    await send('Explique-moi ce passage');
  }, [passage, send]);

  const dismissSelection = useCallback(() => {
    setPassage(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  const newDiscussion = useCallback(async () => {
    try {
      await create();
      setPassage(null);
      await refreshHistory();
    } catch (error) {
      setSendError(error instanceof Error ? error.message : t.errorNetwork);
    }
  }, [create, refreshHistory]);

  const retry = useCallback(async () => {
    if (lastText !== null) await send(lastText, lastFollowUp.current);
  }, [lastText, send]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !open) return;
      if (historyOpen) {
        setHistoryOpen(false);
        return;
      }
      setOpenState(false);
      const button = document.getElementById('ouvrir-tuteur');
      if (button !== null) button.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [historyOpen, open]);

  const toggleContext = useCallback((key: ContextItemDto['key']) => {
    setInclude((current) => ({ ...current, [key]: current[key] === false ? true : false }));
    setContextItems((current) =>
      current.map((item) => (item.key === key ? { ...item, included: !item.included } : item)),
    );
  }, []);

  const setOpen = useCallback(
    (value: boolean) => {
      if (value) openPanel();
      else closePanel();
    },
    [closePanel, openPanel],
  );

  return {
    open,
    setOpen,
    messages,
    streaming,
    conversationId,
    contextItems,
    include,
    toggleContext,
    passage,
    setPassage,
    history,
    historyOpen,
    setHistoryOpen,
    pendingSelfTest,
    fatalError,
    sendError,
    openPanel,
    closePanel,
    send,
    askPassage,
    askSelection,
    dismissSelection,
    newDiscussion,
    loadConversation,
    retry,
    lastText,
  };
}
