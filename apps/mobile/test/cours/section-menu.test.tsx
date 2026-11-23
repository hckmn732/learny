// Jest + RNTL [SPEC-3302] — menu de section, signalement et fiche de source (EF-5, CA-3;
// BR-COU-02, BR-COU-09; CL-1, CL-4).
//
// The report is asserted with the exact call of the API client, `Idempotency-Key` included: under
// Hermes `crypto.randomUUID` does not exist, so the key must be forged by `src/api/idempotency.ts`
// (the mock proves the application passes one).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CourseScreen } from '../../src/features/cours/CourseScreen';
import { pendingProgress } from '../../src/features/cours/progress';
import { openExternal } from '../../src/lib/web';
import { setOnlineForDemo } from '../../src/offline/network';
import { me } from '../programme/fixtures';

import {
  chapterId,
  CITATION_ID,
  courseScreen,
  FLASH_SECTION_ID,
  MODULE_ID,
  SUMMARY_ID,
} from './fixtures';

jest.mock('../../src/lib/web', () => ({
  openExternal: jest.fn(() => Promise.resolve('https://learny.test')),
  openOnWeb: jest.fn(() => Promise.resolve('https://learny.test')),
}));

const mockOpenExternal = jest.mocked(openExternal);

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

/** Accessibility state of a control, read without touching the untyped `props` of a node. */
function isDisabled(node: { readonly props: unknown }): boolean {
  const props = node.props as { accessibilityState?: { disabled?: boolean } };
  return props.accessibilityState?.disabled === true;
}

/** `Idempotency-Key` of a mutation: only its presence is asserted, the value is forged at run time. */
// `expect.any` is the idiomatic matcher of a value forged at run time: the key itself is
// never asserted, only its presence on the mutation.
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- matcher of jest
const forgedKey: string = expect.any(String);

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

async function renderScreen(): Promise<{ onOpenWeb: jest.Mock }> {
  const onOpenWeb = jest.fn();
  await render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}
    >
      <SafeAreaProvider initialMetrics={METRICS}>
        <CourseScreen
          chapterId={chapterId(2)}
          moduleId={MODULE_ID}
          onBack={jest.fn()}
          onOpenChapter={jest.fn()}
          onOpenWeb={onOpenWeb}
        />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.getByTestId('course-title')).toBeTruthy();
  });
  return { onOpenWeb };
}

beforeEach(() => {
  jest.clearAllMocks();
  setOnlineForDemo(true);
  pendingProgress.clear();
  mockApi.meGet.mockResolvedValue(me());
  mockApi.moduleCourse.mockResolvedValue(courseScreen());
  mockApi.courseProgress.mockResolvedValue({
    chapterPercent: 100,
    coursePercent: 68,
    updatedAt: null,
  });
  mockApi.courseSectionReport.mockResolvedValue({
    reportId: SUMMARY_ID,
    sectionId: FLASH_SECTION_ID,
    status: 'open',
    reported: true,
    createdAt: '2026-11-11T12:20:00Z',
  });
});

afterEach(() => {
  setOnlineForDemo(true);
  pendingProgress.clear();
});

describe('[SPEC-3302] menu de section, signalement et source', () => {
  it('propose les trois actions de l’appui long (EF-5, ADR-3010 § 1)', async () => {
    const handlers = await renderScreen();
    await fireEvent.press(screen.getByTestId(`course-section-actions-${FLASH_SECTION_ID}`));
    expect(screen.getByTestId('course-section-menu')).toBeTruthy();
    expect(screen.getByText('Demander au tuteur sur ce passage')).toBeTruthy();
    expect(screen.getByText('Signaler une erreur')).toBeTruthy();
    expect(screen.getByText('Corriger sur le web')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('course-menu-ask'));
    expect(handlers.onOpenWeb).toHaveBeenCalledWith(
      `/formations/00000000-0000-4000-8000-000000000001/modules/${MODULE_ID}/cours?chapitre=${chapterId(2)}`,
    );
  });

  it('signale une section avec une clé d’idempotence forgée par l’application (CA-3, BR-COU-09)', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId(`course-section-actions-${FLASH_SECTION_ID}`));
    await fireEvent.press(screen.getByTestId('course-menu-report'));
    await fireEvent.changeText(
      screen.getByTestId('course-report-reason'),
      'La date de saisie ne fixe pas la période.',
    );
    await fireEvent.press(screen.getByTestId('course-report-submit'));
    await waitFor(() => {
      expect(mockApi.courseSectionReport).toHaveBeenCalledWith(
        {
          params: { sid: FLASH_SECTION_ID },
          body: { reason: 'La date de saisie ne fixe pas la période.' },
        },
        { idempotencyKey: forgedKey },
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('course-reported')).toBeTruthy();
    });
  });

  it('refuse un signalement sans motif (BR-COU-09)', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId(`course-section-actions-${FLASH_SECTION_ID}`));
    await fireEvent.press(screen.getByTestId('course-menu-report'));
    await fireEvent.press(screen.getByTestId('course-report-submit'));
    expect(screen.getByTestId('course-report-notice')).toBeTruthy();
    expect(mockApi.courseSectionReport).not.toHaveBeenCalled();
  });

  it('désactive le signalement et la correction hors ligne (CL-1)', async () => {
    await renderScreen();
    // The network drops while the chapter is already read: the cached article stays readable.
    await act(() => {
      setOnlineForDemo(false);
    });
    await fireEvent.press(screen.getByTestId(`course-section-actions-${FLASH_SECTION_ID}`));
    expect(isDisabled(screen.getByTestId('course-menu-report'))).toBe(true);
    expect(isDisabled(screen.getByTestId('course-menu-edit'))).toBe(true);
    expect(screen.getByTestId('course-menu-offline')).toBeTruthy();
  });

  it('ouvre la source d’une citation et son extrait (CA-3, BR-COU-02)', async () => {
    mockApi.courseCitationSource.mockResolvedValue({
      citationId: CITATION_ID,
      mediaKind: 'note',
      deleted: false,
      url: 'https://learny.test/notes/module-3',
      page: 12,
      startSec: null,
      anchor: null,
    });
    await renderScreen();
    await fireEvent.press(screen.getByTestId('course-citation-chapitre-2-flash-question'));
    await waitFor(() => {
      expect(screen.getByTestId('course-source-label')).toBeTruthy();
    });
    expect(mockApi.courseCitationSource).toHaveBeenCalledWith({ params: { cid: CITATION_ID } });
    expect(screen.getByTestId('course-source-label')).toHaveTextContent(
      'Vos notes · module 3 · p. 12',
    );
    await waitFor(() => {
      expect(screen.getByTestId('course-source-location')).toHaveTextContent('p. 12');
    });
    await fireEvent.press(screen.getByTestId('course-source-open'));
    expect(mockOpenExternal).toHaveBeenCalledWith('https://learny.test/notes/module-3');
  });

  it('affiche « Source indisponible » pour une source supprimée (CL-4)', async () => {
    mockApi.courseCitationSource.mockResolvedValue({
      citationId: CITATION_ID,
      mediaKind: 'note',
      deleted: true,
      url: null,
      page: null,
      startSec: null,
      anchor: null,
    });
    await renderScreen();
    await fireEvent.press(screen.getByTestId('course-citation-chapitre-2-flash-question'));
    await waitFor(() => {
      expect(screen.getByTestId('course-source-unavailable')).toBeTruthy();
    });
    expect(screen.queryByTestId('course-source-open')).toBeNull();
  });
});
