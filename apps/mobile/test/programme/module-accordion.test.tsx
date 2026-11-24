// Jest + RNTL [SPEC-3202] — accordéon des modules (EF-4, ET-2, CA-2; BR-FOR-07, BR-FOR-08).
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ModuleAccordion } from '../../src/features/programme/ModuleAccordion';
import { buildProgrammeView } from '../../src/features/programme/view-model';

import { activeProgramme, courseProgress } from './fixtures';

const model = buildProgrammeView({ programme: activeProgramme(), course: courseProgress() });

interface ExpandedState {
  readonly expanded: boolean;
  readonly disabled: boolean;
}

function expandedState(testID: string): ExpandedState {
  return screen.getByTestId(testID).props.accessibilityState as ExpandedState;
}

async function renderModule(
  position: number,
  handlers: Partial<Parameters<typeof ModuleAccordion>[0]> = {},
): Promise<void> {
  const module = model.modules[position - 1];
  if (module === undefined) throw new Error('module absent des fixtures');
  await render(
    <ModuleAccordion
      module={module}
      resume={module.id === model.modules[2]?.id ? model.resume : null}
      onChapter={jest.fn()}
      onQuiz={jest.fn()}
      onResume={jest.fn()}
      onLocked={jest.fn()}
      onDetail={jest.fn()}
      {...handlers}
    />,
  );
}

describe('[SPEC-3202] accordéon des modules', () => {
  it('déplie le module en cours et annonce son état (EF-4, ET-2)', async () => {
    await renderModule(3);
    expect(expandedState('module-3-toggle')).toEqual({ expanded: true, disabled: false });
    expect(screen.getByTestId('chapter-00000000-0000-4000-8000-00000000000302')).toBeTruthy();
    expect(screen.getByTestId('programme-resume')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('module-3-toggle'));
    expect(expandedState('module-3-toggle')).toEqual({ expanded: false, disabled: false });
  });

  it('replie un module validé et ouvre ses chapitres à l’appui (EF-4)', async () => {
    await renderModule(2);
    expect(expandedState('module-2-toggle').expanded).toBe(false);
    await fireEvent.press(screen.getByTestId('module-2-toggle'));
    expect(expandedState('module-2-toggle').expanded).toBe(true);
    expect(screen.getByText('Validé · 91 %')).toBeTruthy();
  });

  it('ne déplie pas un module verrouillé et ouvre sa fiche (BR-FOR-08)', async () => {
    const onLocked = jest.fn();
    await renderModule(4, { onLocked });
    expect(screen.queryByTestId('module-4-body')).toBeNull();
    await fireEvent.press(screen.getByTestId('module-4-toggle'));
    expect(onLocked).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Chapitre 1 du module 4')).toBeNull();
  });

  it('ouvre le cours et le quiz par leurs boutons (EF-5)', async () => {
    const onChapter = jest.fn();
    const onQuiz = jest.fn();
    await renderModule(3, { onChapter, onQuiz });
    await fireEvent.press(screen.getByTestId('chapter-00000000-0000-4000-8000-00000000000301'));
    expect(onChapter).toHaveBeenCalledWith(
      expect.objectContaining({ position: 1, state: 'validated' }),
      expect.objectContaining({ position: 3 }),
    );
    await fireEvent.press(screen.getByTestId('module-3-quiz'));
    expect(onQuiz).toHaveBeenCalledWith(expect.objectContaining({ position: 3 }));
  });
});
