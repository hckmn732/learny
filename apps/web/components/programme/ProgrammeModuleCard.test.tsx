// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import type { ActiveProgrammeChapterDto, ActiveProgrammeModuleDto } from '@learny/contracts';
import { cleanup, renderComponent, screen } from '@learny/testing/render';

import { ProgrammeModuleCard } from './ProgrammeModuleCard';

afterEach(cleanup);

const FORMATION = '11111111-1111-4111-8111-111111111111';
const MODULE = '22222222-2222-4222-8222-222222222222';
const CHAPTER = '33333333-3333-4333-8333-333333333333';

function moduleDto(overrides: Partial<ActiveProgrammeModuleDto> = {}): ActiveProgrammeModuleDto {
  return {
    id: MODULE,
    position: 1,
    title: 'Fondamentaux de SAP S/4HANA et navigation Fiori',
    objectives: ['Naviguer dans Fiori'],
    plannedStart: '2026-11-02',
    plannedEnd: '2026-11-04',
    threshold: 80,
    status: 'open',
    score: null,
    quizOn: '2026-11-04',
    quizKind: 'quiz',
    unlockAfterPosition: null,
    href: `/formations/${FORMATION}/modules/${MODULE}`,
    ...overrides,
  };
}

const chapter: ActiveProgrammeChapterDto = {
  id: CHAPTER,
  moduleId: MODULE,
  position: 1,
  title: 'Architecture de SAP S/4HANA',
  contributionsStatus: 'done',
  courseHref: `/formations/${FORMATION}/modules/${MODULE}/cours?chapitre=${CHAPTER}`,
};

describe('[SPEC-606] carte de module', () => {
  it('CA-2 — un module ouvert propose « Ouvrir le module » et ses actions', () => {
    renderComponent(
      <ProgrammeModuleCard chapters={[chapter]} defaultExpanded module={moduleDto()} />,
    );
    const action = screen.getByTestId('programme-module-1-action');
    expect(action.textContent).toContain('Ouvrir le module');
    expect(action.getAttribute('href')).toBe(`/formations/${FORMATION}/modules/${MODULE}`);
    expect(screen.getByText('Apports du module')).toBeTruthy();
    expect(screen.getByText('Lire le cours')).toBeTruthy();
    expect(screen.getByText('Exercice pratique')).toBeTruthy();
    expect(screen.getByText('Passer le quiz de validation')).toBeTruthy();
    expect(screen.getByText('Architecture de SAP S/4HANA')).toBeTruthy();
  });

  it('CA-2 — un module verrouillé affiche sa condition et ne porte aucun lien actif', () => {
    renderComponent(
      <ProgrammeModuleCard
        chapters={[chapter]}
        defaultExpanded
        module={moduleDto({
          position: 2,
          status: 'locked',
          unlockAfterPosition: 1,
          href: null,
        })}
      />,
    );
    expect(screen.getByTestId('module-unlock-reason').textContent).toContain(
      'Se débloque quand le quiz du module 1 est validé.',
    );
    expect(screen.queryByTestId('programme-module-2-action')).toBeNull();
    expect(screen.queryByText('Ouvrir le module')).toBeNull();
    expect(screen.queryByText('Passer le quiz de validation')).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByTestId('programme-chapter-1')).toBeTruthy();
  });

  it('BR-FOR-07 — un module validé affiche son score et « Revoir le cours »', () => {
    renderComponent(
      <ProgrammeModuleCard
        chapters={[chapter]}
        module={moduleDto({ status: 'validated', score: 86 })}
      />,
    );
    expect(screen.getByTestId('programme-module-1-status').textContent).toBe('Validé · 86 %');
    const action = screen.getByTestId('programme-module-1-action');
    expect(action.textContent).toContain('Revoir le cours');
    expect(action.getAttribute('href')).toBe(`/formations/${FORMATION}/modules/${MODULE}/cours`);
  });

  it('EF-3 — le pli accessible ouvre et referme les chapitres', async () => {
    const view = renderComponent(<ProgrammeModuleCard chapters={[chapter]} module={moduleDto()} />);
    expect(screen.queryByText('Architecture de SAP S/4HANA')).toBeNull();
    const toggle = screen.getByRole('button');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await view.user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Architecture de SAP S/4HANA')).toBeTruthy();
    await view.user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});
