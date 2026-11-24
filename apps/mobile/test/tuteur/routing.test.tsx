// Jest + RNTL [SPEC-3303] — routage de la feuille du tuteur (EF-1, BR-TUT-01).
//
// The route accepts `courseId`, `chapterId` and `sectionId`; without them the target is resolved from
// the current programme, so the course screen (SPEC-3302), « Demander au tuteur » and a deep link
// open the same discussion. The test pins both forms and the error banner of an unresolved course.
import { render } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import TuteurRoute from '../../app/tuteur';
import type { TutorSnapshot } from '../../src/features/tuteur/conversation-controller';
import type { TutorHook } from '../../src/features/tuteur/use-tutor';
import type { TutorTarget } from '../../src/features/tuteur/use-tutor-target';

import { snapshotOf } from './fixtures';

const mockBack = jest.fn();
const mockParams: { value: Record<string, string> } = { value: {} };
const mockTarget = jest.fn();
const mockUseTutor = jest.fn();
const mockOpenOnWeb = jest.fn((path: string) => Promise.resolve(`https://learny.test${path}`));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams.value,
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../src/offline/network', () => ({
  useOnlineStatus: () => true,
}));

jest.mock('../../src/lib/web', () => ({
  openOnWeb: (path: string) => mockOpenOnWeb(path),
  openExternal: () => Promise.resolve(),
}));

jest.mock('../../src/features/tuteur/use-tutor-target', () => ({
  useTutorTarget: (params: unknown) => mockTarget(params) as TutorTarget,
}));

jest.mock('../../src/features/tuteur/use-tutor', () => ({
  useTutor: (input: unknown) => mockUseTutor(input) as TutorHook,
}));

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

const NOOP_ACTIONS = {
  send: jest.fn(),
  sendFollowUp: jest.fn(),
  stop: jest.fn(),
  retry: jest.fn(),
  newDiscussion: jest.fn(),
  toggleContext: jest.fn(),
  answerSelfTest: jest.fn(),
  createCard: () => Promise.resolve(true),
  refreshCard: jest.fn(),
  load: jest.fn(),
};

function readyState(): TutorSnapshot {
  return snapshotOf();
}

describe('[SPEC-3303] routage de la feuille du tuteur', () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockTarget.mockReset();
    mockUseTutor.mockReset();
  });

  it('transmet les identifiants du cours et du chapitre reçus dans la route (EF-1)', async () => {
    mockParams.value = { courseId: 'course-1', chapterId: 'chapter-2', sectionId: 'section-3' };
    mockTarget.mockReturnValue({
      status: 'ready',
      courseId: 'course-1',
      chapterId: 'chapter-2',
      subtitle: 'Comptabilité générale · chapitre 2',
      retry: jest.fn(),
    });
    mockUseTutor.mockReturnValue({ state: readyState(), actions: NOOP_ACTIONS });

    const view = await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <TuteurRoute />
      </SafeAreaProvider>,
    );

    expect(mockTarget).toHaveBeenCalledWith({ courseId: 'course-1', chapterId: 'chapter-2' });
    expect(mockUseTutor).toHaveBeenCalledWith({ courseId: 'course-1', chapterId: 'chapter-2' });
    expect(view.getByTestId('tutor-subtitle')).toHaveTextContent(
      'Comptabilité générale · chapitre 2',
    );
  });

  it('résout la cible depuis le programme quand la route n’a aucun paramètre (BR-TUT-01)', async () => {
    mockParams.value = {};
    mockTarget.mockReturnValue({
      status: 'ready',
      courseId: 'course-9',
      chapterId: 'chapter-9',
      subtitle: 'Comptabilité générale · chapitre 1',
      retry: jest.fn(),
    });
    mockUseTutor.mockReturnValue({ state: readyState(), actions: NOOP_ACTIONS });

    const view = await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <TuteurRoute />
      </SafeAreaProvider>,
    );

    expect(mockTarget).toHaveBeenCalledWith({ courseId: undefined, chapterId: undefined });
    expect(mockUseTutor).toHaveBeenCalledWith({ courseId: 'course-9', chapterId: 'chapter-9' });
    expect(view.getByTestId('tutor-sheet')).toBeTruthy();
  });

  it('affiche un bandeau et réessaie quand le cours est introuvable (CL-1)', async () => {
    const retry = jest.fn();
    mockParams.value = {};
    mockTarget.mockReturnValue({
      status: 'error',
      courseId: null,
      chapterId: null,
      subtitle: null,
      retry,
    });
    mockUseTutor.mockReturnValue({ state: readyState(), actions: NOOP_ACTIONS });

    const view = await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <TuteurRoute />
      </SafeAreaProvider>,
    );

    expect(view.getByTestId('tutor-error')).toBeTruthy();
    expect(view.getByTestId('tutor-subtitle')).toHaveTextContent('Cours');
  });
});
