// Vitest [SPEC-3301] — reference of a cited passage (BR-COU-02).
import { describe, expect, it } from 'vitest';

import { formatSeconds, locationLabel } from './sources';

describe('[SPEC-3301] référence d’un extrait de ressource', () => {
  it('[SPEC-3301] une page, une minute, une ancre ou un extrait (BR-COU-02)', () => {
    expect(locationLabel({ page: 42 })).toBe('p. 42');
    expect(locationLabel({ startSec: 90 })).toBe('min. 90 1:30');
    expect(locationLabel({ startSec: 90, endSec: 125 })).toBe('min. 90 1:30–2:05');
    expect(locationLabel({ anchor: 'partie-double' })).toBe('ancre partie-double');
    expect(locationLabel({ charStart: 10, charEnd: 40 })).toBe('extrait 10–40');
    expect(locationLabel({})).toBe('extrait');
  });

  it('[SPEC-3301] la page l’emporte sur les autres repères', () => {
    expect(locationLabel({ page: 3, anchor: 'a' })).toBe('p. 3');
  });

  it('[SPEC-3301] les secondes sont formatées en mm:ss', () => {
    expect(formatSeconds(0)).toBe('0:00');
    expect(formatSeconds(9)).toBe('0:09');
    expect(formatSeconds(61)).toBe('1:01');
    expect(formatSeconds(-5)).toBe('0:00');
  });
});
