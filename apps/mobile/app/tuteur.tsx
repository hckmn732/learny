// Route of the tutor sheet: `tuteur?courseId=&chapterId=&sectionId=` (SPEC-3303 EF-1, EF-2).
//
// Presented as a transparent modal, like the notification centre: the sheet keeps the native
// geometry (grabber, height 46 % to 92 %, backdrop that closes it) and the screen behind stays
// visible. The identifiers are optional: the course screen passes them when it opens the sheet, and
// without them the target is resolved from the current programme (ADR-3010 § 1), so a deep link and
// the « Demander au tuteur » entry open the same discussion.
import { useLocalSearchParams, useRouter } from 'expo-router';

import { fr } from '@learny/i18n';

import type { TutorSnapshot } from '../src/features/tuteur/conversation-controller';
import { TutorSheet } from '../src/features/tuteur/TutorSheet';
import { useTutor } from '../src/features/tuteur/use-tutor';
import { useTutorTarget } from '../src/features/tuteur/use-tutor-target';
import { openOnWeb } from '../src/lib/web';
import { useOnlineStatus } from '../src/offline/network';

const t = fr.mobile.tutor;

/** Snapshot of a sheet whose course could not be resolved: the banner offers « Réessayer ». */
const FAILED: TutorSnapshot = {
  status: 'error',
  messages: [],
  turn: null,
  busy: false,
  conversationId: null,
  contextItems: [],
  include: {},
  error: { code: 'UNKNOWN', retryAfterSec: null },
  card: null,
  cardCreated: false,
  suggestions: [],
  selfTestPending: false,
};

export default function TuteurRoute() {
  const params = useLocalSearchParams<{
    courseId?: string;
    chapterId?: string;
    sectionId?: string;
  }>();
  const router = useRouter();
  const online = useOnlineStatus();
  const target = useTutorTarget({
    courseId: typeof params.courseId === 'string' ? params.courseId : undefined,
    chapterId: typeof params.chapterId === 'string' ? params.chapterId : undefined,
  });
  const tutor = useTutor({ courseId: target.courseId, chapterId: target.chapterId });

  const close = (): void => {
    router.back();
  };
  const state = target.status === 'error' ? FAILED : tutor.state;

  return (
    <TutorSheet
      state={state}
      subtitle={target.subtitle ?? t.subtitleFallback}
      online={online}
      onClose={close}
      onSend={(text) => {
        tutor.actions.send(text);
      }}
      onSendFollowUp={(followUp) => {
        tutor.actions.sendFollowUp(followUp);
      }}
      onStop={tutor.actions.stop}
      onRetry={() => {
        if (target.status === 'error') target.retry();
        else tutor.actions.retry();
      }}
      onNewDiscussion={tutor.actions.newDiscussion}
      onToggleContext={tutor.actions.toggleContext}
      onAnswerSelfTest={tutor.actions.answerSelfTest}
      onCreateCard={tutor.actions.createCard}
      onConfigureModels={() => {
        close();
        void openOnWeb('/parametres#modeles').catch(() => undefined);
      }}
    />
  );
}
