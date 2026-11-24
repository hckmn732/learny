// Fixtures of the tutor sheet (SPEC-3303). The sheet is presentational: a snapshot and the
// callbacks are enough to render it, so the component tests never mount the controller nor a client.
import type { ContextItemDto, FollowUpDto, TutorSourceDto } from '@learny/contracts';

import type {
  TutorMessageView,
  TutorSnapshot,
} from '../../src/features/tuteur/conversation-controller';

export const SOURCE: TutorSourceDto = { label: 'Chapitre 2 · L’en-tête de pièce' };
export const FOLLOW_UP: FollowUpDto = { key: 'example', label: 'Un exemple concret' };

export const CONTEXT_ITEMS: ContextItemDto[] = [
  { key: 'formation', label: 'Formation', value: 'SAP S/4HANA Finance', included: true },
  { key: 'chapter', label: 'Chapitre', value: 'Saisie des pièces comptables', included: true },
  { key: 'profile', label: 'Profil', value: 'Vouvoiement, français', included: false },
];

export function learnerMessage(text: string, id = 'm-learner'): TutorMessageView {
  return {
    id,
    role: 'learner',
    text,
    sources: [],
    followUps: [],
    selfTest: null,
    interrupted: false,
  };
}

export function tutorMessage(patch: Partial<TutorMessageView> = {}): TutorMessageView {
  return {
    id: 'm-tutor',
    role: 'tutor',
    text: 'La date de pièce fixe la période comptable.',
    sources: [SOURCE],
    followUps: [FOLLOW_UP],
    selfTest: null,
    interrupted: false,
    ...patch,
  };
}

export function snapshotOf(patch: Partial<TutorSnapshot> = {}): TutorSnapshot {
  return {
    status: 'ready',
    messages: [learnerMessage('Pourquoi deux dates sur une pièce ?'), tutorMessage()],
    turn: null,
    busy: false,
    conversationId: 'c-1',
    contextItems: CONTEXT_ITEMS,
    include: { formation: true, chapter: true, profile: false },
    error: null,
    card: null,
    cardCreated: false,
    suggestions: [],
    selfTestPending: false,
    ...patch,
  };
}

export const NOOP = (): void => undefined;

export const HANDLERS = {
  onClose: NOOP,
  onSend: NOOP,
  onSendFollowUp: NOOP,
  onStop: NOOP,
  onRetry: NOOP,
  onNewDiscussion: NOOP,
  onToggleContext: NOOP,
  onAnswerSelfTest: NOOP,
  onCreateCard: () => Promise.resolve(true),
  onConfigureModels: NOOP,
} as const;
