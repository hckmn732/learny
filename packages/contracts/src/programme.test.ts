import { describe, expect, it } from 'vitest';

import { ProgrammeScreenStateDto, isActiveProgramme } from './programme';

describe('[SPEC-606] isActiveProgramme', () => {
  it('distingue l’état de proposition du programme actif', () => {
    const proposal = {
      formationId: '11111111-1111-4111-8111-111111111111',
      title: 'Titre',
      description: null,
      formationStatus: 'draft',
      cadrageCompleted: false,
      proposal: null,
    } as unknown as ProgrammeScreenStateDto;
    expect(isActiveProgramme(proposal)).toBe(false);
    const active = { formation: {}, calendar: [] } as unknown as ProgrammeScreenStateDto;
    expect(isActiveProgramme(active)).toBe(true);
  });
});
