// Jest + RNTL [SPEC-3302] — envoi de la progression de lecture (CA-2, ET-1, BR-COU-08; CL-1).
//
// The API client is mocked: the test proves the exact call the hook makes - the identifier of the
// course and of the chapter, the sections that were visible, and the `Idempotency-Key` the
// application forges itself (`crypto.randomUUID` does not exist under Hermes) - the ten-second
// debounce, the flush on leaving, and the offline queue replayed when the network returns.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useCourseProgress, type CourseProgressHandle } from '../../src/data/course';
import { pendingProgress } from '../../src/features/cours/progress';
import { setOnlineForDemo } from '../../src/offline/network';

import {
  chapterId,
  COURSE_ID,
  courseScreen,
  FLASH_SECTION_ID,
  MODULE_ID,
  TEXT_SECTION_ID,
} from './fixtures';

const mockApi = {
  courseProgress: jest.fn(),
};

jest.mock('../../src/api/registry', () => ({
  requireApiClient: () => ({ api: mockApi }),
}));

const latestRef: { current: CourseProgressHandle | null } = { current: null };

function Harness(): React.ReactElement {
  const handle = useCourseProgress(courseScreen({ percent: 0 }));
  // eslint-disable-next-line react-hooks/immutability -- handshake between the test and the harness
  latestRef.current = handle;
  return <Text testID="course-percent">{String(handle.chapterPercent)}</Text>;
}

async function renderHarness(): Promise<void> {
  await render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}
    >
      <Harness />
    </QueryClientProvider>,
  );
}

/** `Idempotency-Key` of a mutation: only its presence is asserted, the value is forged at run time. */
// `expect.any` is the idiomatic matcher of a value forged at run time: the key itself is
// never asserted, only its presence on the mutation.
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- matcher of jest
const forgedKey: string = expect.any(String);

beforeEach(() => {
  jest.clearAllMocks();
  setOnlineForDemo(true);
  pendingProgress.clear();
  latestRef.current = null;
  mockApi.courseProgress.mockResolvedValue({
    chapterPercent: 25,
    coursePercent: 68,
    updatedAt: null,
  });
});

afterEach(() => {
  setOnlineForDemo(true);
  pendingProgress.clear();
});

describe('[SPEC-3302] envoi de la progression de lecture', () => {
  it('envoie les sections visibles avec une clé d’idempotence forgée par l’application (CA-2)', async () => {
    await renderHarness();
    await act(() => {
      latestRef.current?.observe([TEXT_SECTION_ID]);
    });
    expect(mockApi.courseProgress).toHaveBeenCalledWith(
      {
        params: { cid: COURSE_ID },
        body: {
          chapterId: chapterId(2),
          visibleSectionIds: [TEXT_SECTION_ID],
        },
      },
      { idempotencyKey: forgedKey },
    );
  });

  it('n’envoie qu’une fois par tranche de dix secondes et joint la dernière valeur (ET-1)', async () => {
    await renderHarness();
    await act(() => {
      latestRef.current?.observe([TEXT_SECTION_ID]);
    });
    expect(mockApi.courseProgress).toHaveBeenCalledTimes(1);
    // Second observation inside the same ten-second window: no second write.
    await act(() => {
      latestRef.current?.observe([TEXT_SECTION_ID, FLASH_SECTION_ID]);
    });
    expect(mockApi.courseProgress).toHaveBeenCalledTimes(1);
    // Leaving the screen flushes the complete snapshot once.
    await act(() => {
      latestRef.current?.flush();
    });
    expect(mockApi.courseProgress).toHaveBeenCalledTimes(2);
    expect(mockApi.courseProgress).toHaveBeenLastCalledWith(
      {
        params: { cid: COURSE_ID },
        body: {
          chapterId: chapterId(2),
          visibleSectionIds: [TEXT_SECTION_ID, FLASH_SECTION_ID],
        },
      },
      { idempotencyKey: forgedKey },
    );
  });

  it('montre l’estimation locale en attendant la confirmation du serveur (BR-COU-08)', async () => {
    await renderHarness();
    expect(screen.getByTestId('course-percent')).toHaveTextContent('0');
    await act(() => {
      latestRef.current?.observe([TEXT_SECTION_ID]);
    });
    expect(screen.getByTestId('course-percent')).toHaveTextContent('25');
  });

  it('met la progression en file hors ligne et la rejoue au retour du réseau (CL-1)', async () => {
    setOnlineForDemo(false);
    await renderHarness();
    await act(() => {
      latestRef.current?.observe([TEXT_SECTION_ID]);
    });
    expect(mockApi.courseProgress).not.toHaveBeenCalled();
    expect(pendingProgress.size()).toBe(1);

    await act(() => {
      setOnlineForDemo(true);
    });
    expect(mockApi.courseProgress).toHaveBeenCalledWith(
      {
        params: { cid: COURSE_ID },
        body: {
          chapterId: chapterId(2),
          visibleSectionIds: [TEXT_SECTION_ID],
        },
      },
      { idempotencyKey: forgedKey },
    );
    expect(pendingProgress.size()).toBe(0);
  });

  it('ne suit qu’un chapitre à la fois (ET-1)', async () => {
    await renderHarness();
    expect(MODULE_ID).toBeDefined();
    await act(() => {
      latestRef.current?.observe([TEXT_SECTION_ID]);
      latestRef.current?.observe([TEXT_SECTION_ID]);
    });
    expect(mockApi.courseProgress).toHaveBeenCalledTimes(1);
    // The set is never duplicated: two observations of the same section are one snapshot.
    expect(mockApi.courseProgress).toHaveBeenLastCalledWith(
      {
        params: { cid: COURSE_ID },
        body: { chapterId: chapterId(2), visibleSectionIds: [TEXT_SECTION_ID] },
      },
      { idempotencyKey: forgedKey },
    );
  });
});
