// Jest + RNTL [SPEC-3302] — sommaire du chapitre (EF-6, BR-COU-11).
//
// The sheet lists the chapters with their reading state and the sections of the current chapter; a
// chapter opens its own page, a section closes the sheet and scrolls the article.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CourseScreen } from '../../src/features/cours/CourseScreen';
import { me } from '../programme/fixtures';

import { chapterId, courseScreen, MODULE_ID, TEXT_SECTION_ID } from './fixtures';

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

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

async function renderScreen(): Promise<{ onOpenChapter: jest.Mock }> {
  const onOpenChapter = jest.fn();
  await render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}
    >
      <SafeAreaProvider initialMetrics={METRICS}>
        <CourseScreen
          chapterId={chapterId(2)}
          moduleId={MODULE_ID}
          onBack={jest.fn()}
          onOpenChapter={onOpenChapter}
          onOpenWeb={jest.fn()}
        />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.getByTestId('course-title')).toBeTruthy();
  });
  return { onOpenChapter };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.meGet.mockResolvedValue(me());
  mockApi.moduleCourse.mockResolvedValue(courseScreen());
  mockApi.courseProgress.mockResolvedValue({
    chapterPercent: 100,
    coursePercent: 68,
    updatedAt: null,
  });
});

describe('[SPEC-3302] sommaire du chapitre', () => {
  it('liste les quatre chapitres et les sections du chapitre courant (EF-6)', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('course-toc'));
    expect(screen.getByTestId('course-toc-sheet')).toBeTruthy();
    expect(screen.getByText('Chapitres')).toBeTruthy();
    expect(screen.getByTestId(`course-toc-chapter-${chapterId(1)}`)).toBeTruthy();
    expect(screen.getByTestId(`course-toc-chapter-${chapterId(4)}`)).toBeTruthy();
    expect(screen.getByTestId(`course-toc-section-${TEXT_SECTION_ID}`)).toBeTruthy();
    // The reading state of each chapter is announced, not only drawn (BR-COU-11).
    const current = screen.getByTestId(`course-toc-chapter-${chapterId(2)}`).props as {
      accessibilityLabel?: string;
      accessibilityState?: { selected?: boolean };
    };
    expect(current.accessibilityLabel).toBe('Chapitre 2, Saisie des pièces comptables, lu');
    expect(current.accessibilityState?.selected).toBe(true);
  });

  it('ouvre un autre chapitre du module (EF-6, BR-COU-11)', async () => {
    const handlers = await renderScreen();
    await fireEvent.press(screen.getByTestId('course-toc'));
    await fireEvent.press(screen.getByTestId(`course-toc-chapter-${chapterId(3)}`));
    expect(handlers.onOpenChapter).toHaveBeenCalledWith(chapterId(3));
    expect(screen.queryByTestId('course-toc-sheet')).toBeNull();
  });

  it('ferme le sommaire quand une section est choisie (EF-6)', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('course-toc'));
    await fireEvent.press(screen.getByTestId(`course-toc-section-${TEXT_SECTION_ID}`));
    expect(screen.queryByTestId('course-toc-sheet')).toBeNull();
    expect(screen.getByTestId('course-title')).toBeTruthy();
  });
});
