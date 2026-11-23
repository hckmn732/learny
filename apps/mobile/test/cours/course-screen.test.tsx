// Jest + RNTL [SPEC-3302] — écran de lecture du cours (CA-1, CA-2, EF-1, EF-3, EF-4, EF-7; CL-2).
//
// The API client is mocked at the registry boundary: the screen runs its real hooks, TanStack Query
// and components, so the test proves the wiring of the course of the demonstration dataset.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CourseScreen, type CourseScreenProps } from '../../src/features/cours/CourseScreen';
import { me } from '../programme/fixtures';
import { expectAccessible } from '../utils/expectAccessible';

import { chapterId, courseScreen, MODULE_ID, pendingCourseScreen } from './fixtures';

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

function client(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

interface Harness {
  readonly onBack: jest.Mock;
  readonly onOpenChapter: jest.Mock;
  readonly onOpenWeb: jest.Mock;
}

async function renderScreen(overrides: Partial<CourseScreenProps> = {}): Promise<Harness> {
  const handlers: Harness = {
    onBack: jest.fn(),
    onOpenChapter: jest.fn(),
    onOpenWeb: jest.fn(),
  };
  await render(
    <QueryClientProvider client={client()}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <CourseScreen
          chapterId={chapterId(2)}
          moduleId={MODULE_ID}
          onBack={handlers.onBack}
          onOpenChapter={handlers.onOpenChapter}
          onOpenWeb={handlers.onOpenWeb}
          {...overrides}
        />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
  return handlers;
}

/** Waits for the article of the chapter, the state every test of this file starts from. */
async function waitArticle(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByTestId('course-article')).toBeTruthy();
  });
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

describe('[SPEC-3302] écran de lecture du cours', () => {
  it('affiche le chapitre 2 sur 4, sa méta et les sections de la maquette (CA-1, EF-1, EF-2)', async () => {
    await renderScreen();
    await waitArticle();
    expect(screen.getByText('Chapitre 2 sur 4')).toBeTruthy();
    expect(screen.getByText('Saisie des pièces comptables')).toBeTruthy();
    expect(screen.getByTestId('course-meta')).toHaveTextContent(
      '8 min de lecture · 4 apports · mis à jour le 9 novembre',
    );
    expect(screen.getByText('Comptabilité générale')).toBeTruthy();
    expect(screen.getByTestId('course-markdown')).toBeTruthy();
    expect(screen.getByTestId('course-quick-question')).toBeTruthy();
    expect(screen.getByTestId('course-confusion')).toBeTruthy();
    expect(screen.getByTestId('course-takeaway')).toBeTruthy();
  });

  it('annonce la progression confirmée du chapitre (BR-COU-08)', async () => {
    await renderScreen();
    await waitArticle();
    const bar = screen.getByTestId('course-progress');
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 100 });
    expect(bar.props.accessibilityLabel).toBe('100 % de ce chapitre lu');
  });

  it('masque la réponse de la question éclair jusqu’à « Afficher la réponse » (BR-COU-05)', async () => {
    await renderScreen();
    await waitArticle();
    expect(screen.queryByTestId('course-answer')).toBeNull();
    await fireEvent.press(screen.getByTestId('course-reveal'));
    expect(screen.getByTestId('course-answer')).toHaveTextContent('40 au débit et 50 au crédit.');
  });

  it('ouvre le tuteur et le quiz depuis la barre inférieure (EF-3)', async () => {
    const handlers = await renderScreen();
    await waitArticle();
    expectAccessible(screen, 'course-ask-tutor', { role: 'button' });
    expectAccessible(screen, 'course-open-quiz', {
      role: 'button',
      label: 'Ouvrir le quiz de validation',
    });
    await fireEvent.press(screen.getByTestId('course-ask-tutor'));
    expect(handlers.onOpenWeb).toHaveBeenCalledWith(
      `/formations/00000000-0000-4000-8000-000000000001/modules/${MODULE_ID}/cours?chapitre=${chapterId(2)}`,
    );
    await fireEvent.press(screen.getByTestId('course-open-quiz'));
    expect(handlers.onOpenWeb).toHaveBeenCalledWith(
      `/formations/00000000-0000-4000-8000-000000000001/modules/${MODULE_ID}/quiz`,
    );
  });

  it('passe au chapitre suivant et revient au programme (EF-4, BR-NAV-04)', async () => {
    const handlers = await renderScreen();
    await waitArticle();
    await fireEvent.press(screen.getByTestId('course-next'));
    expect(handlers.onOpenChapter).toHaveBeenCalledWith(chapterId(3));
    await fireEvent.press(screen.getByTestId('course-back'));
    expect(handlers.onBack).toHaveBeenCalled();
  });

  it('montre l’état vide du cours en préparation avec son rafraîchissement (EF-7)', async () => {
    mockApi.moduleCourse.mockResolvedValue(pendingCourseScreen());
    await renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('course-empty')).toBeTruthy();
    });
    expect(screen.getByText('Le cours est en préparation')).toBeTruthy();
    expect(screen.getByText('Rafraîchir')).toBeTruthy();
  });

  it('affiche l’erreur de lecture avec sa relance (CL-1)', async () => {
    mockApi.moduleCourse.mockRejectedValue(new Error('réseau absent'));
    await renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('course-error')).toBeTruthy();
    });
    expect(screen.getByText('Réessayer')).toBeTruthy();
  });

  it('annonce une nouvelle version du cours et la recharge (CL-2)', async () => {
    await renderScreen();
    await waitArticle();
    expect(screen.queryByTestId('course-version')).toBeNull();
    mockApi.moduleCourse.mockResolvedValue(courseScreen({ version: 2 }));
    await fireEvent(screen.getByTestId('course-article'), 'refresh');
    await waitFor(() => {
      expect(screen.getByTestId('course-version')).toBeTruthy();
    });
    expect(screen.getByText('Une nouvelle version est disponible')).toBeTruthy();
    await fireEvent.press(screen.getByText('Recharger'));
    expect(screen.queryByTestId('course-version')).toBeNull();
  });
});
