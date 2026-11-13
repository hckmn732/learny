import { describe, expect, it } from 'vitest';

import { resolveSources, SourceMarkerFilter, sourceLabel, tutorSource } from './sources';

const candidates = [
  {
    chunkId: '11111111-1111-4111-8111-111111111111',
    resourceId: 'r1',
    title: 'Guide FI (PDF)',
    kind: 'pdf',
    location: { page: 4 },
  },
  {
    chunkId: '33333333-3333-4333-8333-333333333333',
    resourceId: 'r2',
    title: 'Note vocale, 1:42',
    kind: 'audio',
    location: { startSec: 102 },
  },
  {
    chunkId: '44444444-4444-4444-8444-444444444444',
    resourceId: 'r3',
    title: 'Tutoriel vidéo, 5:10',
    kind: 'video',
    location: { startSec: 135 },
  },
];

describe('[SPEC-610] sources de la discussion', () => {
  it('CA-3 — libellés lisibles et citation inventée retirée', () => {
    const warnings: string[] = [];
    const resolved = resolveSources(
      [
        '11111111-1111-4111-8111-111111111111',
        '33333333-3333-4333-8333-333333333333',
        '99999999-9999-4999-8999-999999999999',
      ],
      { candidates, chapterPosition: 2, primaryResourceTitle: 'Guide FI (PDF)' },
      { warn: (message) => warnings.push(message) },
    );
    expect(resolved.sources).toEqual([
      { label: 'Guide FI, p. 4' },
      { label: 'votre note vocale, 1:42' },
    ]);
    expect(resolved.invented).toEqual(['99999999-9999-4999-8999-999999999999']);
    expect(warnings).toEqual(['tutor.chat.invented_source']);
    expect(sourceLabel(candidates[2] as (typeof candidates)[number])).toBe('Tutoriel vidéo, 2:15');
    expect(tutorSource('Guide FI (PDF)').label).toBe(
      'Complété par le tuteur · à confirmer dans Guide FI',
    );
  });

  it('masque le bloc de citation sans couper les deltas', () => {
    const filter = new SourceMarkerFilter();
    let visible = '';
    for (const delta of [
      'Bonjour ',
      'le ',
      'monde. [[sour',
      'ces:11111111-1111-4111-8111-111111111111]]',
    ]) {
      visible += filter.push(delta);
    }
    const finished = filter.finish();
    expect(
      visible + (finished.text.length > visible.length ? finished.text.slice(visible.length) : ''),
    ).toBe('Bonjour le monde. ');
    expect(finished.tokens).toEqual(['11111111-1111-4111-8111-111111111111']);
  });
});
