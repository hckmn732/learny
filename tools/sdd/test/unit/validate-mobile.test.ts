// Unit tests of the SDD tooling of the mobile track (SPEC-3001 EF-4, CA-3).
// They prove that the mobile selection is additive: a specification of another track keeps exactly
// the commands it had before.
import { describe, expect, it } from 'vitest';

import {
  maestroVerdict,
  mobileVisualVerdict,
  summarizeJest,
  summarizeMaestro,
  validationPlan,
} from '../../core.mjs';

function maestroReport(overrides = {}) {
  return {
    spec: 'SPEC-3001',
    platform: 'android',
    passed: 1,
    failed: 0,
    videos: 1,
    visual: 1,
    flows: [
      {
        name: 'SPEC-3001 demo',
        tags: ['SPEC-3001', 'visual'],
        status: 'passed',
        videos: ['artifacts/SPEC-3001-demo/SPEC-3001.mp4'],
        screenshots: ['artifacts/SPEC-3001-demo/SPEC-3001-demo.png'],
        visual: { status: 'passed', diffRatio: 0.001 },
      },
    ],
    ...overrides,
  };
}

describe('[SPEC-3001] sélection des commandes par piste', () => {
  it('garde les commandes historiques pour une piste non mobile', () => {
    expect(validationPlan('python-migration')).toEqual({
      track: 'python-migration',
      jest: null,
      e2e: 'test:e2e',
      visual: 'test:e2e',
      e2eReport: 'e2e.json',
    });
    expect(validationPlan('produit').jest).toBeNull();
  });

  it('ajoute Jest et remplace e2e par Maestro pour la piste mobile', () => {
    const plan = validationPlan('mobile');

    expect(plan.jest).toBe('test:mobile');
    expect(plan.e2e).toBe('test:e2e:mobile');
    expect(plan.visual).toBe('test:e2e:mobile');
    expect(plan.e2eReport).toBe('e2e-mobile.json');
  });
});

describe('[SPEC-3001] summarizeMaestro', () => {
  it('compte les flux de la campagne et ses vidéos', () => {
    const summary = summarizeMaestro(maestroReport(), 'SPEC-3001');

    expect(summary).toMatchObject({ passed: 1, failed: 0, videos: 1, visual: 1 });
    expect(summary.flows).toEqual([
      { name: 'SPEC-3001 demo', status: 'passed', videos: 1, visual: true },
    ]);
  });

  it('ignore les flux des autres spécifications et les étiquettes voisines', () => {
    const report = maestroReport({
      flows: [
        { name: 'autre', tags: ['SPEC-3002'], status: 'passed', videos: [] },
        { name: 'voisin', tags: ['SPEC-30011'], status: 'passed', videos: [] },
        { name: 'le nôtre', tags: ['SPEC-3001'], status: 'passed', videos: ['a.mp4'] },
      ],
    });

    const summary = summarizeMaestro(report, 'SPEC-3001');

    expect(summary.passed).toBe(1);
    expect(summary.flows.map((flow) => flow.name)).toEqual(['le nôtre']);
  });

  it('compte un flux en échec et ne compte pas une comparaison visuelle ratée', () => {
    const report = maestroReport({
      flows: [
        { name: 'ok', tags: ['SPEC-3001'], status: 'passed', videos: ['a.mp4'] },
        {
          name: 'ko',
          tags: ['SPEC-3001', 'visual'],
          status: 'passed',
          videos: ['b.mp4'],
          visual: { status: 'failed', diffRatio: 0.42 },
        },
        { name: 'cassé', tags: ['SPEC-3001'], status: 'missing', videos: [] },
      ],
    });

    const summary = summarizeMaestro(report, 'SPEC-3001');

    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.visual).toBe(0);
  });

  it('tolère un rapport absent ou vide (CL-4 : aucun faux succès)', () => {
    expect(summarizeMaestro(null, 'SPEC-3001')).toEqual({
      passed: 0,
      failed: 0,
      videos: 0,
      visual: 0,
      flows: [],
    });
    expect(summarizeMaestro({}, 'SPEC-3001').passed).toBe(0);
  });
});

describe('[SPEC-3001] verdicts de la campagne mobile', () => {
  it('exige un code 0, un flux réussi, aucun échec et une vidéo', () => {
    const summary = summarizeMaestro(maestroReport(), 'SPEC-3001');

    expect(maestroVerdict(0, summary)).toBe(true);
    expect(maestroVerdict(1, summary)).toBe(false);
    expect(maestroVerdict(0, { ...summary, videos: 0 })).toBe(false);
    expect(maestroVerdict(0, { ...summary, failed: 1 })).toBe(false);
    expect(maestroVerdict(0, { ...summary, passed: 0 })).toBe(false);
  });

  it('exige au moins un flux visuel réussi et aucun échec', () => {
    const summary = summarizeMaestro(maestroReport(), 'SPEC-3001');

    expect(mobileVisualVerdict(summary)).toBe(true);
    expect(mobileVisualVerdict({ ...summary, visual: 0 })).toBe(false);
    expect(mobileVisualVerdict({ ...summary, failed: 1 })).toBe(false);
  });
});

describe('[SPEC-3001] summarizeJest', () => {
  it('compte les tests étiquetés du rapport Jest', () => {
    const report = {
      testResults: [
        {
          name: 'apps/mobile/test/dev-sdd-page.test.tsx',
          assertionResults: [
            { ancestorTitles: ['[SPEC-3001] page de démonstration'], title: 'affiche', status: 'passed' },
            { ancestorTitles: ['[SPEC-3001] page de démonstration'], title: 'casse', status: 'failed' },
            { ancestorTitles: ['[SPEC-3002] autre'], title: 'ailleurs', status: 'passed' },
          ],
        },
      ],
    };

    expect(summarizeJest(report, 'SPEC-3001')).toEqual({ passed: 1, failed: 1 });
    expect(summarizeJest(report, 'SPEC-3003')).toEqual({ passed: 0, failed: 0 });
    expect(summarizeJest(null, 'SPEC-3001')).toEqual({ passed: 0, failed: 0 });
  });
});
