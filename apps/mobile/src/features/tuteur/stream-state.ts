// State of one streamed tutor reply (SPEC-3303 EF-3, EF-5, ET-1, CL-5; ADR-3004 § 6).
//
// Pure reducer of the parts of `@learny/api-client` into the bubble being written: the typing
// indicator lasts until the first fragment, the text grows fragment by fragment, then the sources,
// the follow-ups and the « Teste-moi » state arrive as data parts. Interruption (network cut or
// « Arrêter ») keeps the partial text and flags it, so the sheet shows « Réponse interrompue »
// without losing what the learner has already read (CL-1, ET-2).
import type { TutorReplyPart } from '@learny/api-client';
import type { FollowUpDto, SelfTestDto, TutorSourceDto } from '@learny/contracts';

/** Lifecycle of the tutor bubble being written. */
export type TurnStatus = 'idle' | 'typing' | 'streaming' | 'done' | 'interrupted' | 'error';

export interface TutorTurn {
  readonly status: TurnStatus;
  readonly text: string;
  readonly sources: readonly TutorSourceDto[];
  readonly followUps: readonly FollowUpDto[];
  readonly selfTest: SelfTestDto | null;
  /** Error code of the last failure, `null` while the stream is healthy. */
  readonly code: string | null;
}

export const EMPTY_TURN: TutorTurn = {
  status: 'idle',
  text: '',
  sources: [],
  followUps: [],
  selfTest: null,
  code: null,
};

/** True once the bubble has something to show (typing indicator included). */
export function isTurnVisible(turn: TutorTurn): boolean {
  return turn.status !== 'idle';
}

/** True while the reply is being received: the composer shows « Arrêter » instead of « Envoyer ». */
export function isStreaming(turn: TutorTurn): boolean {
  return turn.status === 'typing' || turn.status === 'streaming';
}

/** Applies one part of the reply stream (EF-3). */
export function applyPart(turn: TutorTurn, part: TutorReplyPart): TutorTurn {
  switch (part.type) {
    case 'text-delta':
      return { ...turn, status: 'streaming', text: turn.text + part.delta };
    case 'data-sources':
      return { ...turn, sources: part.data.sources };
    case 'data-follow-ups':
      return { ...turn, followUps: part.data.followUps };
    case 'data-self-test':
      // The question is complete as soon as the data part arrives: no further fragment follows.
      return { ...turn, selfTest: part.data, status: 'done' };
  }
}

/** The stream ended normally (finish or `[DONE]`). */
export function markDone(turn: TutorTurn): TutorTurn {
  return turn.status === 'done' ? turn : { ...turn, status: 'done' };
}

/** « Arrêter », a closed sheet or the application going to the background (ET-2). */
export function markInterrupted(turn: TutorTurn): TutorTurn {
  return isTurnVisible(turn) ? { ...turn, status: 'interrupted' } : turn;
}

/** A typed failure of the stream (CL-1, EF-7). */
export function markError(turn: TutorTurn, code: string): TutorTurn {
  return { ...turn, status: 'error', code };
}

/** Scheduler used by the coalescer: one animation frame, or a 16 ms timer in Node. */
export type Schedule = (run: () => void) => void;

const defaultSchedule: Schedule = (run) => {
  const raf = (globalThis as { requestAnimationFrame?: (callback: () => void) => unknown })
    .requestAnimationFrame;
  if (typeof raf === 'function') raf(run);
  else setTimeout(run, 16);
};

/**
 * Groups the fragments of one frame into a single text update (CL-5): a long answer arrives as
 * hundreds of `text-delta` parts and the bubble must not re-render for each of them. Nothing is
 * lost: `flush()` writes the last fragments before a state change or the end of the stream.
 */
export class FragmentCoalescer {
  private buffered = '';
  private scheduled = false;

  constructor(
    private readonly onFlush: (text: string) => void,
    private readonly schedule: Schedule = defaultSchedule,
  ) {}

  /** Adds a fragment and asks for one flush per frame at most. */
  push(delta: string): void {
    if (delta === '') return;
    this.buffered += delta;
    if (this.scheduled) return;
    this.scheduled = true;
    this.schedule(() => {
      this.scheduled = false;
      this.flush();
    });
  }

  /** Writes the buffered text now (end of stream, interruption, error). */
  flush(): void {
    const text = this.buffered;
    this.buffered = '';
    if (text !== '') this.onFlush(text);
  }

  /** Text received but not written yet. */
  get pending(): string {
    return this.buffered;
  }
}
