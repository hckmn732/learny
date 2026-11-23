// Jest + RNTL [SPEC-3302] — résumé de fin de chapitre et retour du tuteur (CA-4, BR-COU-07; CL-1,
// CL-4).
//
// The submit is asserted with the exact call of the API client, `Idempotency-Key` included; the
// feedback shown is the one the server returned, never a text written by the screen.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CourseScreen } from '../../src/features/cours/CourseScreen';
import { setOnlineForDemo } from '../../src/offline/network';
import { me } from '../programme/fixtures';

import { chapterId, COURSE_ID, courseScreen, MODULE_ID } from './fixtures';

jest.mock('../../src/lib/web', () => ({
  openExternal: jest.fn(() => Promise.resolve('https://learny.test')),
  openOnWeb: jest.fn(() => Promise.resolve('https://learny.test')),
}));

const mockApi = {
  meGet: jest.fn(),
  moduleCourse: jest.fn(),
  courseProgress: jest.fn(),
  courseCitationSource: jest.fn(),
  courseSectionReport: jest.fn(),
  chapterSummary: jest.fn(),
};

jest.mock('../../src/api/registry', () => ({
  requireApiClient: () => ({ api: mockApi }),
}));

/** `Idempotency-Key` of a mutation: only its presence is asserted, the value is forged at run time. */
// `expect.any` is the idiomatic matcher of a value forged at run time: the key itself is
// never asserted, only its presence on the mutation.
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- matcher of jest
const forgedKey: string = expect.any(String);

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

const CHAPTER = chapterId(4);
const TEXT = 'Une pièce se saisit en deux temps : l’en-tête, puis les postes.';

async function renderScreen(): Promise<void> {
  await render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}
    >
      <SafeAreaProvider initialMetrics={METRICS}>
        <CourseScreen
          chapterId={CHAPTER}
          moduleId={MODULE_ID}
          onBack={jest.fn()}
          onOpenChapter={jest.fn()}
          onOpenWeb={jest.fn()}
        />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.getByTestId('course-summary-input')).toBeTruthy();
  });
}

function feedbackSummary(): unknown {
  return {
    id: '00000000-0000-4000-8000-0000000000c5',
    chapterId: CHAPTER,
    courseId: COURSE_ID,
    text: TEXT,
    feedback: {
      verdict: 'good',
      message: 'Bien vu : vous distinguez la date de pièce de la date de saisie.',
      missing: ['La clé de comptabilisation du poste.'],
    },
    status: 'corrected',
    createdAt: '2026-11-11T12:20:00Z',
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  setOnlineForDemo(true);
  mockApi.meGet.mockResolvedValue(me());
  mockApi.moduleCourse.mockResolvedValue(courseScreen({ withSummary: true, chapter: 4 }));
  mockApi.courseProgress.mockResolvedValue({
    chapterPercent: 100,
    coursePercent: 68,
    updatedAt: null,
  });
});

afterEach(() => {
  setOnlineForDemo(true);
});

describe('[SPEC-3302] résumé de fin de chapitre', () => {
  it('envoie le résumé et affiche le retour du tuteur (CA-4, BR-COU-07)', async () => {
    mockApi.chapterSummary.mockResolvedValue(feedbackSummary());
    await renderScreen();
    await fireEvent.changeText(screen.getByTestId('course-summary-input'), TEXT);
    await fireEvent.press(screen.getByTestId('course-summary-submit'));
    await waitFor(() => {
      expect(mockApi.chapterSummary).toHaveBeenCalledWith(
        { params: { cid: CHAPTER }, body: { courseId: COURSE_ID, text: TEXT } },
        { idempotencyKey: forgedKey },
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('chapter-summary-feedback')).toBeTruthy();
    });
    expect(screen.getByText('Retour du tuteur')).toBeTruthy();
    expect(
      screen.getByText('Bien vu : vous distinguez la date de pièce de la date de saisie.'),
    ).toBeTruthy();
    expect(screen.getByText('• La clé de comptabilisation du poste.')).toBeTruthy();
  });

  it('conserve le texte en brouillon quand le tuteur est indisponible (CL-4)', async () => {
    mockApi.chapterSummary.mockResolvedValue({
      id: '00000000-0000-4000-8000-0000000000c5',
      chapterId: CHAPTER,
      courseId: COURSE_ID,
      text: TEXT,
      feedback: null,
      status: 'deferred',
      createdAt: '2026-11-11T12:20:00Z',
    });
    await renderScreen();
    await fireEvent.changeText(screen.getByTestId('course-summary-input'), TEXT);
    await fireEvent.press(screen.getByTestId('course-summary-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('chapter-summary-deferred')).toBeTruthy();
    });
    expect(screen.queryByTestId('chapter-summary-feedback')).toBeNull();
  });

  it('refuse un résumé vide (BR-COU-07)', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('course-summary-submit'));
    expect(screen.getByTestId('chapter-summary-notice')).toBeTruthy();
    expect(mockApi.chapterSummary).not.toHaveBeenCalled();
  });

  it('désactive la saisie hors ligne (CL-1)', async () => {
    await renderScreen();
    // The network drops while the chapter is already read: the field is disabled, the text stays.
    await act(() => {
      setOnlineForDemo(false);
    });
    const input = screen.getByTestId('course-summary-input').props as { editable?: boolean };
    expect(input.editable).toBe(false);
    expect(screen.getByTestId('chapter-summary-offline')).toBeTruthy();
  });
});
