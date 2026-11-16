'use client';

import { WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { gradeBrick, toPublicBrick, type BrickType, type GradeOutcome } from '@learny/bricks';
import type { SelfGrade } from '@learny/bricks/view';
import {
  REVIEW_GAME_RESPONSE_SCHEMAS,
  type GlobalQuizSessionDto,
  type ReviewAnswerResultDto,
  type ReviewGameFormat,
  type ReviewItemDto,
  type ReviewSummaryDto,
} from '@learny/contracts';
import { clock } from '@learny/core';
import {
  correctionExplanation,
  toBrickResponse,
  toGameCorrection,
} from '@learny/services/review/game-response';
import { EmptyState } from '@learny/ui';

import { readProgress, writeProgress, type StoredPack } from '../../lib/offline/db';
import { enqueue } from '../../lib/offline/queue';
import { fr } from '../../messages/fr';
import { GamePanel } from '../global-quiz/GamePanel';
import { GameRail } from '../global-quiz/GameRail';
import { GlobalQuizHeader } from '../global-quiz/GlobalQuizHeader';
import { SessionEnd } from '../global-quiz/SessionEnd';
import { SessionFooter } from '../global-quiz/SessionFooter';
import { SessionProgress } from '../global-quiz/SessionProgress';

import { OfflineIndicator } from './OfflineIndicator';

const t = fr.globalQuiz;
const to = fr.offline;

/** Full payload → public payload for the shared game views (opaque ids, no solutions). */
function displayItem(item: ReviewItemDto): ReviewItemDto {
  if (item.type === 'recall_card') return item;
  const publicBrick = toPublicBrick({
    brickId: item.brickId,
    versionId: item.brickVersionId,
    type: item.type,
    notionIds: item.notionIds,
    payload: item.payload as never,
  });
  return { ...item, payload: publicBrick.publicPayload };
}

function explanationOf(correction: unknown): string | null {
  if (typeof correction !== 'object' || correction === null) return null;
  return 'explanation' in correction
    ? ((correction as { explanation?: string | null }).explanation ?? null)
    : null;
}

/** Local correction with `@learny/bricks`; FSRS is never computed in the browser (ET-7). */
export function gradeOffline(
  item: ReviewItemDto,
  response: unknown,
  selfGrade?: SelfGrade,
): ReviewAnswerResultDto {
  const base = { position: item.position, skipped: false, notions: [] };
  if (item.type === 'recall_card') {
    const grade = selfGrade ?? (response as { selfRating?: SelfGrade }).selfRating ?? 'good';
    const graded = gradeBrick(
      'recall_card',
      item.payload as never,
      { selfGrade: grade },
      item.brickVersionId,
    );
    const isCorrect = graded.ok ? graded.value.isCorrect : grade !== 'again';
    return {
      ...base,
      isCorrect,
      correction: null,
      explanation: null,
      notions: [{ notionId: item.notionIds[0] ?? '', rating: grade, nextDueAt: null }],
    };
  }
  const schema =
    item.type in REVIEW_GAME_RESPONSE_SCHEMAS
      ? REVIEW_GAME_RESPONSE_SCHEMAS[item.type as ReviewGameFormat]
      : null;
  let brickResponse: unknown = response;
  if (schema !== null) {
    const parsed = schema.safeParse(response);
    if (!parsed.success) {
      return { ...base, isCorrect: false, correction: null, explanation: null };
    }
    brickResponse = toBrickResponse(item.type as ReviewGameFormat, parsed.data);
  }
  const graded = gradeBrick(
    item.type as BrickType,
    item.payload as never,
    brickResponse,
    item.brickVersionId,
  ) as { ok: boolean; value?: GradeOutcome };
  if (!graded.ok || graded.value === undefined) {
    return { ...base, isCorrect: false, correction: null, explanation: null };
  }
  const outcome = graded.value;
  if (schema !== null) {
    const correction = toGameCorrection(
      item.type as ReviewGameFormat,
      item.payload,
      outcome,
      item.brickVersionId,
    );
    return {
      ...base,
      isCorrect: outcome.isCorrect,
      correction,
      explanation: correctionExplanation(outcome),
    };
  }
  return {
    ...base,
    isCorrect: outcome.isCorrect,
    correction: outcome.correction,
    explanation: explanationOf(outcome.correction),
  };
}

export interface OfflineQuizGlobalProps {
  pack: StoredPack;
  timeZone?: string;
}

/**
 * EF-6 — offline revision screen of one formation. It reuses the SPEC-701/702 components, queues
 * every answer and every completion in IndexedDB before showing the local correction, and never
 * displays FSRS due dates: the server computes them when the network returns.
 */
export function OfflineQuizGlobal({ pack, timeZone = 'Europe/Paris' }: OfflineQuizGlobalProps) {
  const session: GlobalQuizSessionDto = pack.session;
  const fullItems = session.items;
  const [items, setItems] = useState<ReviewItemDto[]>(() => fullItems.map(displayItem));
  const [current, setCurrent] = useState<number>(session.currentPosition);
  const [summary, setSummary] = useState<ReviewSummaryDto | null>(() => {
    const raw = session.summary as ReviewSummaryDto | null;
    return raw !== null && typeof raw === 'object' && 'reviewedCount' in raw ? raw : null;
  });
  const [answered, setAnswered] = useState<number[]>([]);
  const [skipped, setSkipped] = useState<number[]>([]);
  const [pending, setPending] = useState(false);
  const startedAt = useRef(0);
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    startedAt.current = performance.now();
    const id = session.sessionId;
    if (id === null) return;
    void readProgress(id).then((progress) => {
      if (progress === undefined) return;
      setAnswered(progress.answered);
      setSkipped(progress.skipped);
      setCurrent(progress.position);
      if (progress.completed) {
        setSummary({
          reviewedCount: progress.answered.length + progress.skipped.length,
          minutes: 1,
          okCount: progress.answered.length,
          soonCount: progress.skipped.length,
          streakDays: 0,
          nextSessionAt: null,
        });
      }
      setItems((previous) =>
        previous.map((item) =>
          progress.answered.includes(item.position)
            ? { ...item, state: 'answered' as const }
            : progress.skipped.includes(item.position)
              ? { ...item, state: 'skipped' as const }
              : item,
        ),
      );
    });
  }, [session.sessionId]);

  const index = Math.max(
    0,
    items.findIndex((item) => item.position === current),
  );
  const item = items[index];
  const last = index === items.length - 1;
  const ended = summary !== null;

  function persist(nextAnswered: number[], nextSkipped: number[], completed = false): void {
    const id = session.sessionId;
    if (id === null) return;
    void writeProgress({
      sessionId: id,
      formationId: pack.formationId,
      position: current,
      answered: nextAnswered,
      skipped: nextSkipped,
      completed,
    });
  }

  function advanceFrom(position: number): void {
    const from = items.findIndex((entry) => entry.position === position);
    const next = items[from + 1];
    if (next !== undefined) setCurrent(next.position);
  }

  async function submit(
    response: unknown,
    options: { skipped?: boolean; selfGrade?: SelfGrade; advance?: boolean } = {},
  ): Promise<void> {
    if (item === undefined || pending) return;
    setPending(true);
    const timeMs = Math.min(
      3_600_000,
      Math.max(0, Math.round(performance.now() - startedAt.current)),
    );
    const isSkipped = options.skipped === true;
    const result: ReviewAnswerResultDto = isSkipped
      ? {
          position: item.position,
          skipped: true,
          isCorrect: null,
          correction: null,
          explanation: null,
          notions: [],
        }
      : gradeOffline(item, response, options.selfGrade);
    try {
      await enqueue({
        kind: 'answer',
        ownerId: pack.ownerId,
        formationId: pack.formationId,
        sessionId: session.sessionId ?? '',
        position: item.position,
        brickVersionId: item.brickVersionId,
        ...(isSkipped ? { skipped: true } : { response }),
        ...(options.selfGrade === undefined ? {} : { selfGrade: options.selfGrade }),
        timeMs,
        answeredAt: clock.now().toISOString(),
      });
    } catch {
      // CL-7 — storage refused: the correction is still shown, the answer stays local to this page.
    }
    const nextAnswered = isSkipped ? answered : [...answered, item.position];
    const nextSkipped = isSkipped ? [...skipped, item.position] : skipped;
    setAnswered(nextAnswered);
    setSkipped(nextSkipped);
    setItems((previous) =>
      previous.map((entry) =>
        entry.position === item.position
          ? { ...entry, state: isSkipped ? 'skipped' : 'answered', result }
          : entry,
      ),
    );
    persist(nextAnswered, nextSkipped);
    setPending(false);
    if (options.advance === true) advanceFrom(item.position);
  }

  async function complete(): Promise<void> {
    if (pending) return;
    setPending(true);
    const reviewed = new Set([...answered, ...skipped]);
    const reviewedItems = fullItems.filter((entry) => reviewed.has(entry.position));
    const notionCount = new Set(reviewedItems.flatMap((entry) => entry.notionIds)).size;
    const okCount = new Set(
      reviewedItems
        .filter((entry) => answered.includes(entry.position))
        .flatMap((entry) => entry.notionIds),
    ).size;
    const next: ReviewSummaryDto = {
      reviewedCount: notionCount,
      minutes: Math.max(1, Math.ceil((performance.now() - startedAt.current) / 60_000)),
      okCount,
      soonCount: notionCount - okCount,
      streakDays: 0,
      nextSessionAt: null,
    };
    try {
      await enqueue({
        kind: 'complete',
        ownerId: pack.ownerId,
        formationId: pack.formationId,
        sessionId: session.sessionId ?? '',
        answeredAt: clock.now().toISOString(),
      });
    } catch {
      // CL-7 — the local end screen stays usable.
    }
    setSummary(next);
    persist(answered, skipped, true);
    setPending(false);
  }

  if (session.sessionId === null || (items.length === 0 && session.status !== 'paused')) {
    return (
      <EmptyState
        data-testid="offline-empty"
        description={to.page.emptyBody}
        title={to.page.emptyTitle}
      />
    );
  }

  const dueLabels: Partial<Record<SelfGrade, string>> = {
    again: to.dueUnknown,
    hard: to.dueUnknown,
    good: to.dueUnknown,
    easy: to.dueUnknown,
  };

  return (
    <div className="flex flex-col gap-24">
      <div className="flex justify-end">
        <OfflineIndicator />
      </div>
      <div
        className="flex items-center gap-12 rounded-16 bg-offline-soft px-16 py-12 text-14 font-600 text-ink"
        data-testid="offline-banner"
        role="status"
      >
        <WifiOff aria-hidden="true" className="h-18 w-18" />
        <span>{to.banner}</span>
      </div>
      <GlobalQuizHeader
        estimatedMinutes={session.header.estimatedMinutes}
        modulesLabel={session.header.modulesLabel}
        notionCount={session.header.notionCount}
        subtitle={session.header.subtitle}
      />
      <SessionProgress
        currentIndex={ended ? items.length : index}
        finished={ended}
        total={items.length}
      />
      <div className="flex flex-wrap items-start gap-20">
        <div className="flex flex-[1_1_260px] flex-col gap-16">
          <GameRail
            currentPosition={ended ? -1 : (item?.position ?? -1)}
            items={items}
            onSelect={(position) => {
              setCurrent(position);
            }}
          />
        </div>
        {summary !== null ? (
          <section
            aria-labelledby="gq-game-title"
            className="flex min-w-0 flex-[999_1_560px] flex-col gap-22 rounded-24 border border-solid border-border bg-surface p-28"
            data-testid="gq-game"
          >
            <h2 className="sr-only" id="gq-game-title">
              {t.end.badge}
            </h2>
            <SessionEnd forDate={session.forDate} summary={summary} timeZone={timeZone} />
          </section>
        ) : item === undefined ? null : (
          <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-12">
            <GamePanel
              dueLabels={dueLabels}
              footer={
                <SessionFooter
                  isLast={last}
                  nextDisabled={item.state === 'todo'}
                  onNext={() => {
                    if (last) {
                      void complete();
                    } else {
                      advanceFrom(item.position);
                    }
                  }}
                  onSkip={() => {
                    void submit(undefined, { skipped: true, advance: true });
                  }}
                  pending={pending}
                  skipDisabled={item.state !== 'todo'}
                />
              }
              item={item}
              onAnswer={(response) => {
                void submit(response);
              }}
              onGrade={(grade) => {
                void submit({ selfRating: grade }, { selfGrade: grade });
              }}
              pending={pending}
              titleRef={titleRef}
            />
          </div>
        )}
      </div>
    </div>
  );
}
