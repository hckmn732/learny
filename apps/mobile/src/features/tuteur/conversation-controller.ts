// Conversation with the tutor of one course (SPEC-3303 ET-1, EF-3 to EF-7; ADR-0040, ADR-3010).
//
// One controller per open sheet, no global state: it loads the last discussion of the course
// (BR-TUT-07), creates it once with an `Idempotency-Key` (ET-1, CL-3), streams the reply of the
// tutor and keeps the state the sheet renders. The controller is a plain class — no React, no
// native import — so the whole behaviour (fragments, interruption, stop, retry, context, created
// card) is proved by Vitest with an injected client (`conversation-controller.test.ts`) and a
// frame scheduler, and the hook is only the `useSyncExternalStore` binding.
//
// Errors: `AI_UNAVAILABLE` carries the reason of the missing model (EF-7), `RATE_LIMITED` its
// `Retry-After`; a `StreamInterruptedError` or an abort keeps the partial text with
// « Réponse interrompue » (CL-1, ET-2) instead of erasing what the learner was reading.
import type { TutorReplyPart } from '@learny/api-client';
import { StreamInterruptedError } from '@learny/api-client';
import type {
  AutomationActionItem,
  ChatContextInput,
  ContextItemDto,
  ContextKey,
  ConversationDto,
  ConversationSummaryDto,
  FollowUpDto,
  SelfTestAnswerDto,
  SelfTestDto,
  SendMessageInput,
  TutorMessageDto,
  TutorSourceDto,
} from '@learny/contracts';
import { isAppError } from '@learny/core';

import {
  applyPart,
  EMPTY_TURN,
  FragmentCoalescer,
  markDone,
  markInterrupted,
  isStreaming,
  type Schedule,
  type TutorTurn,
} from './stream-state';

/** A message of the thread, as the sheet renders it. */
export interface TutorMessageView {
  readonly id: string;
  readonly role: 'learner' | 'tutor';
  readonly text: string;
  readonly sources: readonly TutorSourceDto[];
  readonly followUps: readonly FollowUpDto[];
  readonly selfTest: SelfTestDto | null;
  /** True when the reply was stopped or cut: the bubble carries « Réponse interrompue ». */
  readonly interrupted: boolean;
}

/** Codes the sheet turns into a message and an action (EF-7, CL-1). */
export type TutorErrorCode =
  | 'AI_UNAVAILABLE'
  | 'AI_MODEL_MISSING'
  | 'AI_RATE_LIMITED'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'STREAM'
  | 'UNKNOWN';

export interface TutorError {
  readonly code: TutorErrorCode;
  /** Seconds of the `Retry-After` of a 429, `null` otherwise. */
  readonly retryAfterSec: number | null;
}

export interface TutorSnapshot {
  readonly status: 'loading' | 'ready' | 'error';
  readonly messages: readonly TutorMessageView[];
  /** Bubble being written, `null` between two replies. */
  readonly turn: TutorTurn | null;
  /** True while a reply is being received (typing or streaming). */
  readonly busy: boolean;
  readonly conversationId: string | null;
  readonly contextItems: readonly ContextItemDto[];
  readonly include: Readonly<Record<string, boolean>>;
  readonly error: TutorError | null;
  /** Pending `card_created` proposal of this conversation (BR-AUT-06). */
  readonly card: AutomationActionItem | null;
  /** True once the learner confirmed the card of this sheet. */
  readonly cardCreated: boolean;
  /** API labels proposed when the discussion is empty (EF-4). */
  readonly suggestions: readonly FollowUpDto[];
  readonly selfTestPending: boolean;
}

/** Card proposal fields read out of the journal payload (`questions_cartes`). */
export interface CardProposalFields {
  readonly question: string;
  readonly answer: string;
  readonly notionLabel: string;
  readonly sourceLabel: string;
}

/**
 * Surface of the typed client used here. `@learny/api-client` supplies it in the application; the
 * unit tests inject a fake one, so no test needs a device nor a network.
 */
export interface TutorClient {
  readonly listConversations: (
    courseId: string,
  ) => Promise<{ items: readonly ConversationSummaryDto[] }>;
  readonly getConversation: (id: string) => Promise<ConversationDto>;
  readonly createConversation: (
    courseId: string,
    chapterId: string,
    idempotencyKey: string,
  ) => Promise<ConversationDto>;
  readonly streamReply: (
    conversationId: string,
    body: SendMessageInput,
    options: { readonly signal?: AbortSignal },
  ) => AsyncGenerator<TutorReplyPart>;
  readonly answerSelfTest: (conversationId: string, text: string) => Promise<SelfTestAnswerDto>;
  readonly listCardProposals: (conversationId: string) => Promise<readonly AutomationActionItem[]>;
  readonly acceptCard: (id: string, idempotencyKey: string) => Promise<AutomationActionItem>;
}

export interface TutorControllerDeps {
  readonly client: TutorClient;
  readonly courseId: string;
  readonly chapterId: string;
  /** `Idempotency-Key` of one intent, stable until `resolveKey` (ET-1, BR-PLA-08). */
  readonly keyFor: (intentId: string) => string;
  readonly resolveKey: (intentId: string) => void;
  /** Identifier of an optimistic bubble (the sheet never waits for the server to render). */
  readonly newId: () => string;
  readonly schedule?: Schedule;
}

export const CREATE_INTENT = 'tutor:create';
export const CARD_INTENT = 'tutor:card';

/** Empty context map, in the normative order of the six keys (ADR-0178 § 1). */
function includeOf(items: readonly ContextItemDto[]): Record<string, boolean> {
  const include: Record<string, boolean> = {};
  for (const item of items) include[item.key] = item.included;
  return include;
}

function toView(message: TutorMessageDto): TutorMessageView {
  return {
    id: message.id,
    role: message.role,
    text: message.content,
    sources: message.sources,
    followUps: message.followUps,
    selfTest: message.selfTest,
    interrupted: false,
  };
}

/** Error code of a failed call: the API code, its model reason, or the stream itself (EF-7). */
export function errorCodeOf(error: unknown): TutorErrorCode {
  if (error instanceof StreamInterruptedError) return 'STREAM';
  if (isAppError(error)) {
    if (error.code === 'AI_UNAVAILABLE') {
      return error.reason === 'no_model_selected' || error.reason === 'credential_not_qualified'
        ? 'AI_MODEL_MISSING'
        : 'AI_UNAVAILABLE';
    }
    if (error.code === 'RATE_LIMITED' || error.code === 'AI_RATE_LIMITED') return 'RATE_LIMITED';
    if (error.code === 'NETWORK_ERROR') return 'NETWORK';
    if (error.code === 'AI_TASK_FAILED' || error.code === 'AI_REFUSED') return 'AI_UNAVAILABLE';
  }
  return 'UNKNOWN';
}

/** Fields of a `card_created` proposal, `null` when the payload is not the expected one. */
export function cardFieldsOf(item: AutomationActionItem): CardProposalFields | null {
  const payload = item.payload;
  const question = payload.question;
  const answer = payload.answer;
  const notionLabel = payload.notionLabel;
  const sourceLabel = payload.sourceLabel;
  if (typeof question !== 'string' || typeof answer !== 'string') return null;
  return {
    question,
    answer,
    notionLabel: typeof notionLabel === 'string' ? notionLabel : '',
    sourceLabel: typeof sourceLabel === 'string' ? sourceLabel : '',
  };
}

const INITIAL: TutorSnapshot = {
  status: 'loading',
  messages: [],
  turn: null,
  busy: false,
  conversationId: null,
  contextItems: [],
  include: {},
  error: null,
  card: null,
  cardCreated: false,
  suggestions: [],
  selfTestPending: false,
};

/** State machine of one tutor discussion (ET-1). */
export class ConversationController {
  private snapshot: TutorSnapshot = INITIAL;
  private readonly listeners = new Set<() => void>();
  private creating: Promise<string> | null = null;
  private abort: AbortController | null = null;
  private lastQuestion: string | null = null;
  private lastFollowUp: FollowUpDto['key'] | undefined;
  private closed = false;

  /** True once the sheet is closed: no later answer may append a bubble (ET-2). */
  private isClosed(): boolean {
    return this.closed;
  }

  constructor(private readonly deps: TutorControllerDeps) {}

  /** `useSyncExternalStore` subscription. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Immutable snapshot of the sheet. */
  getSnapshot = (): TutorSnapshot => this.snapshot;

  private set(patch: Partial<TutorSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  private setTurn(turn: TutorTurn | null): void {
    this.set({ turn, busy: turn !== null && isStreaming(turn) });
  }

  private applyConversation(dto: ConversationDto): void {
    const messages = dto.messages.map(toView);
    const lastTutor = [...messages].reverse().find((message) => message.role === 'tutor');
    this.set({
      status: 'ready',
      conversationId: dto.id,
      messages,
      contextItems: dto.contextItems,
      include: includeOf(dto.contextItems),
      suggestions: lastTutor?.followUps ?? [],
      selfTestPending:
        dto.pendingSelfTest || messages.some((message) => message.selfTest?.status === 'pending'),
    });
  }

  /** Reads the last discussion of the course, or opens it when the course has none (BR-TUT-07). */
  async load(): Promise<void> {
    this.set({ status: 'loading', error: null });
    try {
      const list = await this.deps.client.listConversations(this.deps.courseId);
      const latest = list.items[0];
      if (latest === undefined) {
        await this.ensureConversation();
      } else {
        this.applyConversation(await this.deps.client.getConversation(latest.id));
      }
      await this.refreshCard();
    } catch (error) {
      this.set({ status: 'error', error: { code: errorCodeOf(error), retryAfterSec: null } });
    }
  }

  /**
   * Identifier of the discussion, created once: a second call while the first is in flight shares
   * the same promise, so a double tap never opens two discussions (CL-2, CL-3).
   */
  private ensureConversation(): Promise<string> {
    if (this.snapshot.conversationId !== null) return Promise.resolve(this.snapshot.conversationId);
    if (this.creating !== null) return this.creating;
    const intent = `${CREATE_INTENT}:${this.deps.courseId}:${this.deps.chapterId}`;
    this.creating = (async () => {
      const dto = await this.deps.client.createConversation(
        this.deps.courseId,
        this.deps.chapterId,
        this.deps.keyFor(intent),
      );
      this.deps.resolveKey(intent);
      this.applyConversation(dto);
      return dto.id;
    })().finally(() => {
      this.creating = null;
    });
    return this.creating;
  }

  /** Context sent with the next question: only the included keys, `false` for a retired one (CA-5). */
  contextPayload(): ChatContextInput {
    const include: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(this.snapshot.include)) include[key] = value;
    return { include };
  }

  /** Adds or removes one context item for the next questions (BR-TUT-02, CA-5). */
  toggleContext(key: ContextKey): void {
    const included = this.snapshot.include[key] ?? true;
    this.set({ include: { ...this.snapshot.include, [key]: !included } });
  }

  /** True once the discussion of the course is loaded (the sheet can ask a question). */
  private isReady(): boolean {
    return this.snapshot.status === 'ready';
  }

  /**
   * Sends a question (EF-5, CL-2): the first call opens the discussion, then the reply streams
   * into a new bubble. A second press while a reply runs is ignored.
   */
  async send(text: string, followUp?: FollowUpDto['key']): Promise<void> {
    const question = text.trim();
    if (this.closed || question === '' || this.snapshot.busy) return;
    if (!this.isReady()) {
      await this.load();
      if (!this.isReady()) return;
    }
    let conversationId: string;
    try {
      conversationId = await this.ensureConversation();
    } catch (error) {
      this.set({ error: { code: errorCodeOf(error), retryAfterSec: null } });
      return;
    }
    if (this.isClosed()) return;

    this.lastQuestion = question;
    this.lastFollowUp = followUp;
    this.set({
      messages: [
        ...this.snapshot.messages,
        {
          id: this.deps.newId(),
          role: 'learner',
          text: question,
          sources: [],
          followUps: [],
          selfTest: null,
          interrupted: false,
        },
      ],
      error: null,
      cardCreated: false,
      suggestions: [],
    });
    this.setTurn({ ...EMPTY_TURN, status: 'typing' });

    const coalescer = new FragmentCoalescer(
      (delta) => {
        const turn = this.snapshot.turn;
        if (turn === null) return;
        this.setTurn({ ...turn, text: turn.text + delta, status: 'streaming' });
      },
      this.deps.schedule ??
        ((run) => {
          const raf = (globalThis as { requestAnimationFrame?: (callback: () => void) => unknown })
            .requestAnimationFrame;
          if (typeof raf === 'function') raf(run);
          else setTimeout(run, 16);
        }),
    );

    const controller = new AbortController();
    this.abort = controller;
    const body: SendMessageInput = {
      text: question,
      context: this.contextPayload(),
      ...(followUp === undefined ? {} : { followUp }),
    };

    try {
      for await (const part of this.deps.client.streamReply(conversationId, body, {
        signal: controller.signal,
      })) {
        if (part.type === 'text-delta') {
          coalescer.push(part.delta);
          continue;
        }
        coalescer.flush();
        const turn = this.snapshot.turn;
        if (turn !== null) this.setTurn(applyPart(turn, part));
      }
      coalescer.flush();
      this.commitTurn('done');
    } catch (error) {
      coalescer.flush();
      const turn = this.snapshot.turn;
      const code = errorCodeOf(error);
      const aborted = controller.signal.aborted;
      if (turn !== null && turn.text !== '' && (aborted || code === 'STREAM')) {
        // CL-1, ET-2 — the partial answer stays readable, the retry sends the same question.
        this.commitTurn('interrupted');
      } else if (turn !== null && turn.text !== '') {
        this.commitTurn('interrupted');
        this.set({ error: { code, retryAfterSec: null } });
      } else {
        this.setTurn(null);
        this.set({
          error: {
            code,
            retryAfterSec: isAppError(error) ? (error.retryAfterSec ?? null) : null,
          },
        });
      }
    } finally {
      if (this.abort === controller) this.abort = null;
      this.set({ busy: false });
    }
  }

  /** « Stop »: cuts the stream and keeps the partial text (ET-2). */
  stop(): void {
    this.abort?.abort();
  }

  /** « Réessayer »: the same question, without a second learner bubble (CL-1). */
  async retry(): Promise<void> {
    const question = this.lastQuestion;
    if (question === null || this.snapshot.busy) return;
    const messages = [...this.snapshot.messages];
    // The interrupted answer is replaced by the new attempt, the question is not asked twice.
    while (messages.length > 0 && messages[messages.length - 1]?.role === 'tutor') messages.pop();
    if (messages.length > 0 && messages[messages.length - 1]?.role === 'learner') messages.pop();
    this.set({ messages, error: null, suggestions: [] });
    await this.send(question, this.lastFollowUp);
  }

  /** Appends the reply of the tutor to the thread (internal). */
  private commitTurn(status: 'done' | 'interrupted'): void {
    const turn = this.snapshot.turn;
    if (turn === null) return;
    const finished = status === 'done' ? markDone(turn) : markInterrupted(turn);
    const view: TutorMessageView = {
      id: this.deps.newId(),
      role: 'tutor',
      text: finished.text,
      sources: finished.sources,
      followUps: finished.followUps,
      selfTest: finished.selfTest,
      interrupted: finished.status === 'interrupted',
    };
    const messages =
      finished.text === '' && finished.sources.length === 0 && finished.selfTest === null
        ? this.snapshot.messages
        : [...this.snapshot.messages, view];
    this.set({
      messages,
      suggestions:
        finished.selfTest === null && finished.followUps.length > 0
          ? finished.followUps
          : this.snapshot.suggestions,
      selfTestPending: finished.selfTest?.status === 'pending' || this.snapshot.selfTestPending,
    });
    this.setTurn(null);
    void this.refreshCard();
  }

  /** Answers the pending « Teste-moi » question (BR-TUT-04). */
  async answerSelfTest(text: string): Promise<void> {
    const conversationId = this.snapshot.conversationId;
    const answer = text.trim();
    if (conversationId === null || answer === '' || this.snapshot.busy) return;
    this.set({ error: null });
    try {
      const dto = await this.deps.client.answerSelfTest(conversationId, answer);
      this.set({
        messages: [...this.snapshot.messages, toView(dto.message)],
        selfTestPending: false,
      });
    } catch (error) {
      this.set({ error: { code: errorCodeOf(error), retryAfterSec: null } });
    }
  }

  /** Reads the pending card proposal of this conversation (BR-AUT-06, « avec ma confirmation »). */
  async refreshCard(): Promise<void> {
    const conversationId = this.snapshot.conversationId;
    if (conversationId === null) return;
    try {
      const proposals = await this.deps.client.listCardProposals(conversationId);
      this.set({ card: proposals[0] ?? null });
    } catch {
      // A missing proposal is not an error of the discussion: the card action simply stays absent.
      this.set({ card: null });
    }
  }

  /** Confirms the pending card: the server creates the brick of the next global quiz (CA-3). */
  async createCard(): Promise<boolean> {
    const card = this.snapshot.card;
    if (card === null) return false;
    try {
      await this.deps.client.acceptCard(card.id, this.deps.keyFor(CARD_INTENT));
      this.deps.resolveKey(CARD_INTENT);
      this.set({ card: null, cardCreated: true });
      return true;
    } catch (error) {
      this.set({ error: { code: errorCodeOf(error), retryAfterSec: null } });
      return false;
    }
  }

  /** « Nouvelle discussion »: the thread is cleared and the discussion reopened on demand. */
  newDiscussion(): void {
    this.stop();
    this.lastQuestion = null;
    this.lastFollowUp = undefined;
    const contextItems = this.snapshot.contextItems;
    this.set({
      messages: [],
      turn: null,
      busy: false,
      conversationId: null,
      error: null,
      card: null,
      cardCreated: false,
      suggestions: [],
      selfTestPending: false,
      status: 'ready',
      include: includeOf(contextItems),
    });
    void this.ensureConversation().catch((error: unknown) => {
      this.set({ error: { code: errorCodeOf(error), retryAfterSec: null } });
    });
  }

  /** The sheet is closing: the stream is cut and no later update reaches a listener (ET-2). */
  close(): void {
    this.closed = true;
    this.stop();
  }
}
