// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NotionGraphDto } from '@learny/contracts';
import { cleanup, renderComponent, screen } from '@learny/testing/render';

import { fr } from '../../messages/fr';

import { GraphDetail } from './GraphDetail';
import { GraphList } from './GraphList';

const t = fr.notionGraph;

const FORMATION = '11111111-1111-4111-8111-111111111111';
const MODULE = '22222222-2222-4222-8222-222222222222';
const NOTION = '33333333-3333-4333-8333-333333333333';
const PREREQUISITE = '44444444-4444-4444-8444-444444444444';
const CONFUSED = '55555555-5555-4555-8555-555555555555';
const TUTOR = '66666666-6666-4666-8666-666666666666';
const SOURCE = '77777777-7777-4777-8777-777777777777';

function graph(): NotionGraphDto {
  return {
    formationId: FORMATION,
    formationTitle: 'SAP S/4HANA Finance',
    timezone: 'Europe/Paris',
    generatedAt: '2026-11-11T12:20:00Z',
    nodes: [
      {
        id: `notion:${FORMATION}`,
        kind: 'formation',
        label: 'SAP S/4HANA Finance',
        order: 0,
        moduleId: null,
        modulePosition: null,
        moduleTitle: null,
        chapterPosition: null,
        notionPosition: null,
        definition: null,
        mastery: null,
        masteryStatus: null,
        gapNature: null,
        courseHref: null,
        trainingHref: null,
        gapHref: null,
      },
      {
        id: `notion:${MODULE}`,
        kind: 'module',
        label: 'Module 2 · Structure organisationnelle',
        order: 1,
        moduleId: MODULE,
        modulePosition: 2,
        moduleTitle: 'Structure organisationnelle',
        chapterPosition: null,
        notionPosition: null,
        definition: null,
        mastery: null,
        masteryStatus: null,
        gapNature: null,
        courseHref: null,
        trainingHref: null,
        gapHref: null,
      },
      {
        id: `notion:${NOTION}`,
        kind: 'notion',
        label: 'Variante d’exercice',
        order: 2,
        moduleId: MODULE,
        modulePosition: 2,
        moduleTitle: 'Structure organisationnelle',
        chapterPosition: 2,
        notionPosition: 1,
        definition: 'Définit l’exercice et ses périodes comptables.',
        mastery: 60,
        masteryStatus: 'to_consolidate',
        gapNature: 'forgetting',
        courseHref: `/formations/${FORMATION}/modules/${MODULE}/cours#variante`,
        trainingHref: `/formations/${FORMATION}/quiz-global?cible=${NOTION}`,
        gapHref: `/formations/${FORMATION}/lacunes?nature=forgetting`,
      },
      {
        id: `notion:${PREREQUISITE}`,
        kind: 'notion',
        label: 'Société',
        order: 3,
        moduleId: MODULE,
        modulePosition: 2,
        moduleTitle: 'Structure organisationnelle',
        chapterPosition: 1,
        notionPosition: 1,
        definition: null,
        mastery: 90,
        masteryStatus: 'mastered',
        gapNature: null,
        courseHref: null,
        trainingHref: null,
        gapHref: null,
      },
      {
        id: `notion:${CONFUSED}`,
        kind: 'notion',
        label: 'Date comptable',
        order: 4,
        moduleId: MODULE,
        modulePosition: 2,
        moduleTitle: 'Structure organisationnelle',
        chapterPosition: 2,
        notionPosition: 2,
        definition: null,
        mastery: 83,
        masteryStatus: 'mastered',
        gapNature: null,
        courseHref: null,
        trainingHref: null,
        gapHref: null,
      },
      {
        id: `notion:${TUTOR}`,
        kind: 'notion',
        label: 'Clôture de période',
        order: 5,
        moduleId: MODULE,
        modulePosition: 2,
        moduleTitle: 'Structure organisationnelle',
        chapterPosition: 3,
        notionPosition: 1,
        definition: null,
        mastery: null,
        masteryStatus: 'upcoming',
        gapNature: null,
        courseHref: null,
        trainingHref: null,
        gapHref: null,
      },
      {
        id: `notion:${SOURCE}`,
        kind: 'source',
        label: 'PDF · exercices comptables',
        order: 6,
        moduleId: null,
        modulePosition: null,
        moduleTitle: null,
        chapterPosition: null,
        notionPosition: null,
        definition: null,
        mastery: null,
        masteryStatus: null,
        gapNature: null,
        courseHref: null,
        trainingHref: null,
        gapHref: null,
      },
    ],
    links: [
      { id: 'p', from: `notion:${PREREQUISITE}`, to: `notion:${NOTION}`, kind: 'prerequisite' },
      { id: 'p2', from: `notion:${NOTION}`, to: `notion:${TUTOR}`, kind: 'prerequisite' },
      { id: 'c', from: `notion:${NOTION}`, to: `notion:${CONFUSED}`, kind: 'confusion' },
      { id: 't', from: `notion:${NOTION}`, to: `notion:${TUTOR}`, kind: 'tutor' },
      { id: 's', from: `notion:${SOURCE}`, to: `notion:${NOTION}`, kind: 'source' },
    ],
    gaps: [
      {
        notionId: NOTION,
        label: 'Variante d’exercice',
        mastery: 60,
        nature: 'forgetting',
        href: `/formations/${FORMATION}/lacunes?nature=forgetting`,
      },
    ],
    stats: {
      notions: 4,
      links: 4,
      modules: 1,
      mastered: 2,
      upcoming: 1,
      openGaps: 1,
    },
  };
}

afterEach(() => {
  cleanup();
});

describe('[SPEC-616] panneau détail et liste clavier', () => {
  it('affiche le mode d’emploi et « À consolider » sans sélection (BR-CAR-04)', async () => {
    const onSelect = vi.fn();
    const { user } = renderComponent(
      <GraphDetail graph={graph()} selectedId={null} onSelect={onSelect} onClose={vi.fn()} />,
    );
    expect(screen.getByText(t.detail.emptyTitle)).toBeTruthy();
    expect(screen.getByText(t.detail.gapsTitle(1))).toBeTruthy();
    await user.click(screen.getByTestId('graph-gap-item'));
    expect(onSelect).toHaveBeenCalledWith(`notion:${NOTION}`);
  });

  it('groupe les liens d’une notion et expose les trois actions (CA-3)', () => {
    renderComponent(
      <GraphDetail
        graph={graph()}
        selectedId={`notion:${NOTION}`}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const detail = screen.getByTestId('graph-detail');
    for (const label of [
      t.detail.groups.dependsOn,
      t.detail.groups.prepares,
      t.detail.groups.confusion,
      t.detail.groups.tutor,
      t.detail.groups.sources,
    ]) {
      expect(detail.textContent).toContain(label);
    }
    expect(screen.getByTestId('graph-course-link').getAttribute('href')).toBe(
      `/formations/${FORMATION}/modules/${MODULE}/cours#variante`,
    );
    expect(screen.getByTestId('graph-train-link').getAttribute('href')).toBe(
      `/formations/${FORMATION}/quiz-global?cible=${NOTION}`,
    );
    expect(screen.getByTestId('graph-gap-link').getAttribute('href')).toBe(
      `/formations/${FORMATION}/lacunes?nature=forgetting`,
    );
  });

  it('adapte le panneau aux nœuds module et apport (BR-CAR-04)', () => {
    const { unmount } = renderComponent(
      <GraphDetail
        graph={graph()}
        selectedId={`notion:${MODULE}`}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('graph-detail').textContent).toContain(t.detail.groups.moduleNotions);
    unmount();
    renderComponent(
      <GraphDetail
        graph={graph()}
        selectedId={`notion:${SOURCE}`}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('graph-detail').textContent).toContain(t.detail.groups.fedNotions);
    expect(screen.getByTestId('graph-detail').textContent).toContain('Variante d’exercice');
  });

  it('parcourt la liste textuelle au clavier et sélectionne un nœud (ET-5, CA-3)', async () => {
    const onSelect = vi.fn();
    const { user } = renderComponent(<GraphList graph={graph()} onSelect={onSelect} />);
    const button = screen.getAllByTestId('graph-list-node')[0];
    if (button === undefined) throw new Error('liste vide');
    button.focus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(`notion:${FORMATION}`);
    expect(screen.getAllByTestId('graph-list-relation').length).toBeGreaterThan(0);
  });
});
