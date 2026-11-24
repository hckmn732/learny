// Jest + RNTL [SPEC-3201] — fiches série, rétention et lacunes (EF-4, BR-GAM-02, BR-MEM-06).
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { GapListDto, StreakDto } from '@learny/contracts';

import { GapsSheet, RetentionSheet, StreakSheet } from '../../src/features/aujourdhui/TodaySheets';

jest.mock('../../src/data/home', () => ({
  useSlotAlternatives: () => ({ status: 'ready', data: null, refetch: jest.fn() }),
  useSlotMove: () => ({ move: jest.fn(), pending: false }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const STREAK: StreakDto = {
  days: 12,
  regularity: Array.from({ length: 14 }, (_, index) => ({
    date: `2026-11-${String(index + 1).padStart(2, '0')}`,
    status: index < 2 ? ('none' as const) : ('done' as const),
  })),
  timezone: 'Europe/Paris',
  computedOn: '2026-11-11',
  nextMilestone: null,
};

const GAPS: GapListDto = {
  formationId: 'f-sap',
  formationTitle: 'SAP S/4HANA Finance',
  nature: null,
  summary: { openGaps: 4, masteredNotions: 23, gapModules: [2, 3], masteredModules: [1, 2, 3] },
  countsByNature: { forgetting: 1, confusion: 1, misunderstanding: 1, application: 1 },
  items: [
    {
      notionId: 'n-1',
      notionLabel: 'Clé de comptabilisation',
      nature: 'confusion',
      recommendedAction: 'global_quiz',
      confusedWithLabel: 'Date de pièce',
      moduleId: 'm-3',
      modulePosition: 3,
      moduleTitle: 'Comptabilité générale',
      chapterId: 'c-1',
      chapterTitle: 'Saisie',
      revealedBy: 'Quiz de validation',
      detectedAt: '2026-11-10T15:42:00.000Z',
      mastery: 35,
      threshold: 80,
      training: { kind: 'quiz', href: '/formations/f-sap/quiz-global' },
      course: null,
    },
  ],
  nextReviewAt: null,
  timezone: 'Europe/Paris',
  generatedAt: '2026-11-11T12:20:00.000Z',
};

function withProviders(node: React.ReactElement): React.ReactElement {
  return <SafeAreaProvider initialMetrics={METRICS}>{node}</SafeAreaProvider>;
}

describe('[SPEC-3201] fiche Série', () => {
  it('affiche les jours et les quatorze cases de régularité (BR-GAM-02)', async () => {
    const view = await render(
      withProviders(<StreakSheet visible onClose={jest.fn()} streak={STREAK} />),
    );
    expect(view.getByTestId('streak-sheet')).toBeTruthy();
    expect(view.getByTestId('streak-sheet-days')).toHaveTextContent('12');
    expect(view.getByText('Série de 12 jours')).toBeTruthy();
    expect(view.getByTestId('streak-cell-0')).toBeTruthy();
    expect(view.getByTestId('streak-cell-13')).toBeTruthy();
  });
});

describe('[SPEC-3201] fiche Rétention', () => {
  it('affiche la valeur à 1 mois et l’absence de mesure à 2 mois (BR-MEM-06)', async () => {
    const view = await render(
      withProviders(
        <RetentionSheet
          visible
          onClose={jest.fn()}
          oneMonth={null}
          twoMonths={null}
          followed={23}
          toConsolidate={4}
        />,
      ),
    );
    expect(view.getByTestId('retention-sheet')).toBeTruthy();
    expect(view.getByTestId('retention-sheet-value')).toHaveTextContent('—');
    expect(view.getByTestId('retention-sheet-no-measure')).toBeTruthy();
    expect(view.getByTestId('retention-sheet-two-months')).toHaveTextContent(
      'Pas encore de mesure à 2 mois.',
    );
  });

  it('affiche un pourcentage mesuré', async () => {
    const view = await render(
      withProviders(
        <RetentionSheet
          visible
          onClose={jest.fn()}
          oneMonth={86}
          twoMonths={79}
          followed={14}
          toConsolidate={4}
        />,
      ),
    );
    expect(view.getByTestId('retention-sheet-value')).toHaveTextContent('86 %');
    expect(view.getByTestId('retention-sheet-two-months')).toHaveTextContent('79 % à 2 mois.');
  });
});

describe('[SPEC-3201] fiche Lacunes', () => {
  it('liste les notions et propose le web (EF-4)', async () => {
    const onOpenWeb = jest.fn();
    const view = await render(
      withProviders(<GapsSheet visible onClose={jest.fn()} gaps={GAPS} onOpenWeb={onOpenWeb} />),
    );
    expect(view.getByTestId('gaps-sheet')).toBeTruthy();
    expect(view.getByText('4 notions à consolider')).toBeTruthy();
    expect(view.getByTestId('gaps-item-n-1')).toBeTruthy();
    expect(view.getByText('Clé de comptabilisation')).toBeTruthy();
    await fireEvent.press(view.getByTestId('gaps-open-web'));
    expect(onOpenWeb).toHaveBeenCalledTimes(1);
  });

  it('affiche l’état vide sans lacune', async () => {
    const view = await render(
      withProviders(
        <GapsSheet
          visible
          onClose={jest.fn()}
          gaps={{ ...GAPS, items: [], summary: { ...GAPS.summary, openGaps: 0 } }}
          onOpenWeb={jest.fn()}
        />,
      ),
    );
    expect(view.getByTestId('gaps-sheet-empty')).toBeTruthy();
  });
});
