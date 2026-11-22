// Tests de l'appariement artefacts ↔ flux (ADR-3015 § 2).
//
// L'ancien lanceur indexait les captures par nom de fichier et se rabattait sur le premier flux :
// trois flux visuels héritaient de la même image. Ces tests interdisent ce repli.
import { describe, expect, it } from 'vitest';

import { attributeArtifacts, flowSlug, screenshotsForFlow, videosForFlow } from './artifacts.mjs';

interface Flow {
  name: string;
  file: string;
}

const FLOWS: Flow[] = [
  { name: 'SPEC-3101 connexion', file: 'SPEC-3101-connexion.yaml' },
  { name: 'SPEC-3102 coquille', file: 'SPEC-3102-coquille.yaml' },
  { name: 'SPEC-3103 profil', file: 'SPEC-3103-profil.yaml' },
];

/** Accès vérifié à un flux : évite les assertions non nulles dans un test. */
function flowAt(index: number): Flow {
  const flow = FLOWS[index];
  if (flow === undefined) throw new Error(`flux ${String(index)} absent du jeu de test`);
  return flow;
}

/** Sortie de `--test-output-dir` : un répertoire par flux, captures et vidéo sous ce répertoire. */
function outputArtifacts(flows: Flow[] = FLOWS, index = 0) {
  return flows.map((flow, position) => ({
    name: `capture-${String(index + position)}.png`,
    path: `${flow.name}/takeScreenshot/capture-${String(index + position)}.png`,
  }));
}

describe('[SPEC-3001] appariement des artefacts aux flux', () => {
  it('range chaque capture dans le répertoire de son flux, sans mélange', () => {
    const { byFlow, unattributed } = attributeArtifacts({
      flows: FLOWS,
      artifacts: outputArtifacts(),
    });

    expect(unattributed).toEqual([]);
    for (const [position, flow] of FLOWS.entries()) {
      expect(screenshotsForFlow(byFlow, flow).map((artifact) => artifact.name)).toEqual([
        `capture-${String(position)}.png`,
      ]);
    }
  });

  it('suit le champ `flow` posé par l’agent, et le préfère au chemin', () => {
    const { byFlow } = attributeArtifacts({
      flows: FLOWS,
      artifacts: [
        { name: 'generique.png', path: 'sortie/generique.png', flow: 'SPEC-3102 coquille' },
      ],
    });

    expect(screenshotsForFlow(byFlow, flowAt(1))).toHaveLength(1);
    expect(screenshotsForFlow(byFlow, flowAt(0))).toHaveLength(0);
  });

  it('ne se rabat jamais sur le premier flux : un artefact orphelin reste non rattaché', () => {
    const { byFlow, unattributed } = attributeArtifacts({
      flows: FLOWS,
      artifacts: [{ name: 'capture-0.png' }, { name: 'capture-1.png' }],
    });

    expect(unattributed.map((entry) => entry.reason)).toEqual(['sans-flux', 'sans-flux']);
    for (const flow of FLOWS) expect(screenshotsForFlow(byFlow, flow)).toHaveLength(0);
  });

  it('refuse un flux inconnu au lieu de le rattacher au hasard', () => {
    const { byFlow, unattributed } = attributeArtifacts({
      flows: FLOWS,
      artifacts: [{ name: 'capture.png', flow: 'SPEC-9999 fantôme' }],
    });

    expect(unattributed).toEqual([
      { artifact: { name: 'capture.png', flow: 'SPEC-9999 fantôme' }, reason: 'flux-inconnu' },
    ]);
    expect(Object.values(byFlow).flatMap((bucket) => bucket.screenshots)).toHaveLength(0);
  });

  it('classe les vidéos à part des captures, y compris la vidéo de campagne', () => {
    const { byFlow } = attributeArtifacts({
      flows: FLOWS,
      artifacts: [
        { name: 'campagne.mp4', path: 'campagne.mp4' },
        { name: 'flux.mp4', path: 'SPEC-3103 profil/startRecording/flux.mp4' },
        { name: 'capture-2.png', path: 'SPEC-3103 profil/takeScreenshot/capture-2.png' },
      ],
    });

    expect(videosForFlow(byFlow, flowAt(2)).map((artifact) => artifact.name)).toEqual(['flux.mp4']);
    expect(screenshotsForFlow(byFlow, flowAt(2)).map((artifact) => artifact.name)).toEqual([
      'capture-2.png',
    ]);
    expect(Object.values(byFlow).flatMap((bucket) => bucket.videos)).toHaveLength(1);
  });

  it('apparie un nom de fichier qui ne désigne qu’un flux (anciennes campagnes locales)', () => {
    const { byFlow } = attributeArtifacts({
      flows: FLOWS,
      artifacts: [{ name: 'SPEC-3102-coquille.png' }],
    });

    expect(screenshotsForFlow(byFlow, flowAt(1))).toHaveLength(1);
    expect(screenshotsForFlow(byFlow, flowAt(0))).toHaveLength(0);
  });

  it('normalise les clés de flux (accents, espaces, casse)', () => {
    expect(flowSlug('SPEC-3003 session')).toBe('spec-3003-session');
    expect(flowSlug('Réviser — quiz global')).toBe('reviser-quiz-global');
    expect(flowSlug('')).toBe('');
  });
});
