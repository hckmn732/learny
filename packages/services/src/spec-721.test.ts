import { describe, expect, it } from 'vitest';

import { AUTOMATION_OPTIONS } from '@learny/config/product';

import { pauseEndDateInZone, pauseSummary, validatePauseEndDate } from './pause';

const NOW = new Date('2026-11-11T12:20:00Z');
const ZONE = 'Europe/Paris';

describe('[SPEC-721] règles et calculs', () => {
  it('CA-1 — une pause de trois jours se termine à la date civile locale et respecte les bornes', () => {
    expect(pauseEndDateInZone(NOW, ZONE, 3)).toBe('2026-11-14');
    expect(pauseEndDateInZone(NOW, 'Pacific/Auckland', 3)).toBe('2026-11-15');
    expect(validatePauseEndDate('2026-11-11', '2026-11-11')).toEqual({ ok: true });
    expect(validatePauseEndDate('2026-11-10', '2026-11-11')).toMatchObject({ ok: false });
    expect(validatePauseEndDate('', '2026-11-11')).toMatchObject({ ok: false });
    expect(validatePauseEndDate('demain', '2026-11-11')).toMatchObject({ ok: false });
  });

  it('CA-1, CA-2 — le journal explique une pause et son retour sur une seule ligne', () => {
    const started = pauseSummary('pause_started', '2026-11-14', true, 'vous');
    expect(started).toContain('2026-11-14');
    expect(started).toContain('série');
    expect(started).not.toMatch(/[\r\n]/);
    expect(started.length).toBeLessThanOrEqual(160);

    const withDiagnostic = pauseSummary('pause_ended', '2026-11-14', true, 'tu');
    expect(withDiagnostic).toContain('10 minutes');
    expect(withDiagnostic).toContain('notions à risque');

    const withoutDiagnostic = pauseSummary('pause_ended', '2026-11-14', false, 'tu');
    expect(withoutDiagnostic).not.toContain('diagnostic');
    expect(withoutDiagnostic).toContain('planning');
  });

  it('CA-2 — le diagnostic par défaut dure dix minutes et reste dans les bornes produit', () => {
    expect(AUTOMATION_OPTIONS.pause.diagnosticMinutes).toEqual([10]);
    expect(AUTOMATION_OPTIONS.pause.diagnosticOnReturn).toEqual([true, false]);
  });
});
