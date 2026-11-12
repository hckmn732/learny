import { describe, expect, it } from 'vitest';

import { SidebarUpdateInput } from '@learny/contracts';

import { formationMonogram, lastCivilDays, shiftCivilDay } from './sidebar';

describe('[SPEC-304] Coquille : menu latéral — dérivations', () => {
  it('calcule le sigle de repli d’une formation (ADR-0162)', () => {
    expect(formationMonogram('SAP S/4HANA Finance')).toBe('SA');
    expect(formationMonogram('Gestion de projet agile')).toBe('GE');
    expect(formationMonogram('Éco-conception')).toBe('EC');
    expect(formationMonogram('Python')).toBe('PY');
    expect(formationMonogram('')).toBe('?');
    expect(formationMonogram('é')).toBe('E');
  });

  it('construit les 14 jours civils se terminant aujourd’hui, du plus ancien au plus récent', () => {
    expect(shiftCivilDay('2026-11-11', -1)).toBe('2026-11-10');
    expect(shiftCivilDay('2026-11-01', -1)).toBe('2026-10-31');
    expect(shiftCivilDay('2026-12-31', 1)).toBe('2027-01-01');
    const days = lastCivilDays('2026-11-11');
    expect(days).toHaveLength(14);
    expect(days[0]).toBe('2026-10-29');
    expect(days[13]).toBe('2026-11-11');
    expect(days).toEqual([...days].sort());
  });

  it('exige au moins une préférence dans la mise à jour du menu (ET-3)', () => {
    expect(SidebarUpdateInput.safeParse({ collapsed: true }).success).toBe(true);
    expect(SidebarUpdateInput.safeParse({ collapsed: false }).success).toBe(true);
    expect(
      SidebarUpdateInput.safeParse({ currentFormationId: '11111111-1111-4111-8111-111111111111' })
        .success,
    ).toBe(true);
    expect(SidebarUpdateInput.safeParse({}).success).toBe(false);
    expect(SidebarUpdateInput.safeParse({ currentFormationId: 'pas-un-uuid' }).success).toBe(false);
  });
});
