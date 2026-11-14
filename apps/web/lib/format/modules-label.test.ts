import { describe, expect, it } from 'vitest';

import { modulesLabel } from './modules-label';

describe('[SPEC-701] modulesLabel', () => {
  it('EF-3 — nomme un module unique', () => {
    expect(modulesLabel([2])).toBe('Module 2');
  });

  it('EF-3 — mêle deux modules', () => {
    expect(modulesLabel([1, 2])).toBe('Modules 1 et 2 mêlés');
    expect(modulesLabel([2, 1])).toBe('Modules 1 et 2 mêlés');
  });

  it('EF-3 — énumère trois modules et plus', () => {
    expect(modulesLabel([1, 2, 4])).toBe('Modules 1, 2 et 4 mêlés');
    expect(modulesLabel([4, 2, 1, 2])).toBe('Modules 1, 2 et 4 mêlés');
  });

  it('EF-3 — renvoie une chaîne vide sans module', () => {
    expect(modulesLabel([])).toBe('');
    expect(modulesLabel([0])).toBe('');
  });
});
