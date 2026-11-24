// [SPEC-4003] Modèle d'affichage du mode simple : rôles, indicateurs, modules, résultat.
import { describe, expect, it } from 'vitest';

import type { ProgrammeProposalDto, SimpleState } from '@learny/contracts';

import {
  acquiredTitle,
  analysisProgress,
  fileMeta,
  formatBytes,
  generationRows,
  hasCourseSource,
  hasReadyCourse,
  moduleRows,
  previewKpis,
  roleLabel,
  scoreLine,
  sourceRows,
} from './view-model';

const PROPOSAL: ProgrammeProposalDto = {
  formationId: '00000000-0000-4000-8000-000000000001',
  version: 1,
  source: 'document',
  proposalStatus: 'proposed',
  title: 'Comptabilité générale',
  description: null,
  summary: null,
  volumeHours: 112,
  createdAt: '2026-11-11T12:20:00Z',
  activeFormationCount: 1,
  versions: [],
  modules: Array.from({ length: 14 }, (_, index) => ({
    position: index + 1,
    title: `Module ${String(index + 1)}`,
    objectives: ['Objectif'],
    plannedStart: index === 0 ? '2026-11-11' : '2026-11-12',
    plannedEnd: index === 13 ? '2026-12-15' : '2026-11-20',
    threshold: 80,
    chapters: [
      {
        position: 1,
        title: 'Chapitre',
        notions: [{ label: 'Notion', definition: 'Définition' }],
        pageFrom: 1,
        pageTo: 40,
      },
    ],
    pageFrom: 1,
    pageTo: 40,
    status: null,
  })),
};

const STATE: SimpleState = {
  formationId: PROPOSAL.formationId,
  title: 'Nouvelle formation',
  status: 'collecting',
  motivation: null,
  steps: [
    { key: 'read', state: 'done', detail: '862 pages' },
    { key: 'structure', state: 'running', detail: null },
    { key: 'practice', state: 'todo', detail: null },
    { key: 'programme', state: 'todo', detail: null },
  ],
  chaptersFound: [],
  sources: [
    {
      resourceId: '00000000-0000-4000-8000-000000000010',
      title: 'Manuel.pdf',
      kind: 'pdf',
      role: 'course',
      pages: 712,
      status: 'ready',
    },
  ],
  error: null,
  proposalVersion: null,
};

describe('[SPEC-4003] modèle d’affichage du dépôt et de l’aperçu', () => {
  it('traduit les quatre rôles comme la maquette', () => {
    expect(roleLabel('course')).toBe('Cours');
    expect(roleLabel('exercises')).toBe('Exercices');
    expect(roleLabel('exam_papers')).toBe('Annales');
    expect(roleLabel('other')).toBe('Autre support');
  });

  it('formate les tailles et les pages d’une ligne', () => {
    expect(formatBytes(38 * 1024 * 1024)).toBe('38 Mo');
    expect(formatBytes(512 * 1024)).toBe('512 ko');
    expect(fileMeta({ pages: 712, sizeBytes: 38 * 1024 * 1024 })).toBe('712 pages · 38 Mo');
  });

  it('détecte un cours prêt et calcule la progression de l’analyse', () => {
    expect(hasCourseSource(STATE)).toBe(true);
    expect(hasReadyCourse(STATE)).toBe(true);
    expect(analysisProgress(STATE)).toBe(0.25);
    expect(sourceRows(STATE)[0]?.statusLabel).toBe('Prêt');
  });

  it('calcule les quatre indicateurs de l’aperçu', () => {
    const kpis = previewKpis(PROPOSAL);
    expect(kpis.modules).toBe('14');
    expect(kpis.hours).toBe('112 h');
    expect(kpis.end).toBe('15 décembre');
    expect(Number(kpis.perDay.replace(',', '.').replace(' h', ''))).toBeGreaterThan(0);
  });

  it('affiche quatre modules puis le reste', () => {
    const rows = moduleRows(PROPOSAL);
    expect(rows.shown).toHaveLength(4);
    expect(rows.others).toBe(10);
    expect(rows.shown[0]?.pages).toBe('p. 1–40');
  });

  it('produit la ligne de score et le titre des modules acquis', () => {
    expect(scoreLine({ skipped: false, score: 85, total: 20 })).toBe(
      'Diagnostic terminé · 17 bonnes réponses sur 20',
    );
    expect(scoreLine({ skipped: true, score: 85, total: 20 })).toBeNull();
    expect(acquiredTitle(0)).toBe('Aucun module acquis : on commence au début');
    expect(acquiredTitle(2)).toBe('2 modules déjà acquis');
  });

  it('liste l’état de génération des modules', () => {
    const state: SimpleState = {
      ...STATE,
      status: 'proposed',
      generation: [
        {
          moduleId: '00000000-0000-4000-8000-000000000020',
          position: 1,
          title: 'La TVA',
          state: 'ready',
        },
        {
          moduleId: '00000000-0000-4000-8000-000000000021',
          position: 2,
          title: 'Trésorerie',
          state: 'generating',
        },
      ],
    };
    const rows = generationRows(state);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.detail).toBe('Prêt');
    expect(rows[1]?.detail).toBe('En préparation…');
  });
});
