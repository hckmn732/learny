// Proof that the shared packages resolve from the application (SPEC-3001 ET-2) under the same
// module resolution the Metro bundle uses: pnpm workspace links, TypeScript sources transpiled.
import { HealthResponse } from '@learny/contracts';
import { zonedParts } from '@learny/core';
import { fr } from '@learny/i18n';
import { colors, radiiPx } from '@learny/ui/tokens';

describe('[SPEC-3001] résolution des paquets partagés (ET-2)', () => {
  it('résout @learny/core et son horloge de zone', () => {
    const parts = zonedParts('2026-11-11T12:20:00Z', 'Europe/Paris');

    expect(parts.hour).toBe(13);
    expect(parts.minute).toBe(20);
    expect(parts.localDate).toBe('2026-11-11');
  });

  it('résout @learny/contracts et son schéma de santé', () => {
    const parsed = HealthResponse.safeParse({
      status: 'ok',
      version: '1.0.0',
      commit: 'abcdef0',
      database: 'ok',
      components: { database: 'ok', build: 'ok' },
    });

    expect(parsed.success).toBe(true);
  });

  it('résout @learny/i18n et l’espace de messages mobile', () => {
    expect(fr.mobile.sdd.spec3001.title).toBe('SPEC-3001 · socle mobile');
    expect(fr.mobile.config.title).toBe('Configuration invalide');
  });

  it('résout @learny/ui/tokens', () => {
    expect(colors.canvas).toBe('#F4F4F1');
    expect(radiiPx).toContain(22);
  });
});
