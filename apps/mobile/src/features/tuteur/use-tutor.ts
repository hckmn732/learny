// Hook of the tutor sheet (SPEC-3303 ET-1, ET-2).
//
// One controller per open sheet, bound to React with `useSyncExternalStore`: no global state, no
// context, nothing shared between two sheets. The lifecycle rules of ET-2 live here — the stream is
// cut when the sheet unmounts (closed by the cross, the backdrop, the system back or the gesture)
// and when the application goes to the background — and the partial text stays in the controller.
import { useEffect, useMemo } from 'react';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { ContextKey, FollowUpDto } from '@learny/contracts';

import { idempotencyRegistry } from '../../api/idempotency';
import { requireApiClient } from '../../api/registry';
import { uuidV4 } from '../../api/uuid';

import { ConversationController, type TutorSnapshot } from './conversation-controller';
import { apiTutorClient } from './tutor-client';

/** Snapshot of a sheet that has no resolved target yet. */
const IDLE: TutorSnapshot = {
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

export interface TutorActions {
  readonly send: (text: string, followUp?: FollowUpDto['key']) => void;
  /** One follow-up of the API: its label is the question sent, its key the scenario (EF-9). */
  readonly sendFollowUp: (followUp: FollowUpDto) => void;
  readonly stop: () => void;
  readonly retry: () => void;
  readonly newDiscussion: () => void;
  readonly toggleContext: (key: ContextKey) => void;
  readonly answerSelfTest: (text: string) => void;
  readonly createCard: () => Promise<boolean>;
  readonly refreshCard: () => void;
  readonly load: () => void;
}

export interface TutorHook {
  readonly state: TutorSnapshot;
  readonly actions: TutorActions;
}

const NOOP: TutorActions = {
  send: () => undefined,
  sendFollowUp: () => undefined,
  stop: () => undefined,
  retry: () => undefined,
  newDiscussion: () => undefined,
  toggleContext: () => undefined,
  answerSelfTest: () => undefined,
  createCard: () => Promise.resolve(false),
  refreshCard: () => undefined,
  load: () => undefined,
};

/** Discussion of one course and chapter (ET-1). */
export function useTutor(input: {
  readonly courseId: string | null;
  readonly chapterId: string | null;
}): TutorHook {
  const { courseId, chapterId } = input;

  const controller = useMemo(() => {
    if (courseId === null || chapterId === null) return null;
    return new ConversationController({
      client: apiTutorClient(requireApiClient()),
      courseId,
      chapterId,
      keyFor: (intentId) => idempotencyRegistry.keyFor(intentId),
      resolveKey: (intentId) => {
        idempotencyRegistry.resolve(intentId);
      },
      newId: () => uuidV4(),
    });
  }, [courseId, chapterId]);

  const state = useSyncExternalStore(
    controller?.subscribe ?? (() => () => undefined),
    controller?.getSnapshot ?? (() => IDLE),
    controller?.getSnapshot ?? (() => IDLE),
  );

  useEffect(() => {
    if (controller === null) return undefined;
    void controller.load();
    // ET-2 — a backgrounded application cuts the stream; the partial answer stays on screen.
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') controller.stop();
    });
    return () => {
      subscription.remove();
      controller.close();
    };
  }, [controller]);

  const actions = useMemo<TutorActions>(() => {
    if (controller === null) return NOOP;
    return {
      send: (text, followUp) => {
        void controller.send(text, followUp);
      },
      sendFollowUp: (followUp) => {
        void controller.send(followUp.label, followUp.key);
      },
      stop: () => {
        controller.stop();
      },
      retry: () => {
        void controller.retry();
      },
      newDiscussion: () => {
        controller.newDiscussion();
      },
      toggleContext: (key) => {
        controller.toggleContext(key);
      },
      answerSelfTest: (text) => {
        void controller.answerSelfTest(text);
      },
      createCard: () => controller.createCard(),
      refreshCard: () => {
        void controller.refreshCard();
      },
      load: () => {
        void controller.load();
      },
    };
  }, [controller]);

  return { state, actions };
}
