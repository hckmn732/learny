// Tests du préflight de campagne mobile sur émulateur local (ADR-3018).
//
// Les fonctions pures sont testées ici : lecture de `e2e.env`, cohérence des clés (clés du mode
// distant refusées), réécriture de la sonde `10.0.2.2` → `127.0.0.1`, classement d'une réponse
// HTTP, seuil disque et verdicts d'`adb devices` / `sys.boot_completed`. Le CLI, qui exécute les
// commandes et les requêtes, n'est pas testé unitairement.
import { describe, expect, it } from 'vitest';

import {
  adbVerdict,
  bootVerdict,
  checkEnv,
  classifyHttp,
  diskVerdict,
  hostProbeUrl,
  parseEnvFile,
  REQUIRED_KEYS,
} from '../../mobile-preflight.mjs';

const LOCAL = {
  EXPO_PUBLIC_API_URL: 'http://10.0.2.2:3001',
  EXPO_PUBLIC_SUPABASE_URL: 'http://10.0.2.2:54321',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  EXPO_PUBLIC_WEB_URL: 'http://10.0.2.2:3100',
};

describe('[SPEC-3001] préflight de campagne mobile locale', () => {
  it('lit e2e.env sans confondre commentaires et valeurs', () => {
    const content = [
      '# commentaire',
      'EXPO_PUBLIC_API_URL=http://10.0.2.2:3001',
      '',
      'MOBILE_AVD=learny',
    ].join('\n');

    const env = parseEnvFile(content);
    expect(env.EXPO_PUBLIC_API_URL).toBe('http://10.0.2.2:3001');
    expect(env.MOBILE_AVD).toBe('learny');
    expect(env['# commentaire']).toBeUndefined();
  });

  it('exige les quatre clés du build et de la campagne', () => {
    expect([...REQUIRED_KEYS].sort()).toEqual([
      'EXPO_PUBLIC_API_URL',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY',
      'EXPO_PUBLIC_SUPABASE_URL',
      'EXPO_PUBLIC_WEB_URL',
    ]);
    expect(checkEnv({}).missing.sort()).toEqual([...REQUIRED_KEYS].sort());
    expect(checkEnv(LOCAL).ok).toBe(true);
  });

  it('refuse les clés du mode distant retiré (ADR-3018)', () => {
    for (const key of [
      'MOBILE_DEVICE_AGENT_URL',
      'MOBILE_DEVICE_AGENT_TOKEN',
      'MOBILE_APK_URL',
      'AGENT37_INSTANCE_ID',
    ]) {
      const verdict = checkEnv({ ...LOCAL, [key]: 'https://vieux.test' });
      expect(verdict.ok).toBe(false);
      expect(verdict.problems.join(' ')).toContain(key);
    }
  });

  it('refuse la boucle locale de l’hôte : l’émulateur la joint par 10.0.2.2', () => {
    for (const value of ['http://127.0.0.1:3001', 'http://localhost:3001']) {
      const verdict = checkEnv({ ...LOCAL, EXPO_PUBLIC_API_URL: value });
      expect(verdict.ok).toBe(false);
      expect(verdict.problems.join(' ')).toContain('10.0.2.2');
    }
  });

  it('refuse une URL qui n’est pas http(s)', () => {
    const verdict = checkEnv({ ...LOCAL, EXPO_PUBLIC_API_URL: '10.0.2.2:3001' });
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.join(' ')).toContain('http(s)');
  });

  it('réécrit 10.0.2.2 en 127.0.0.1 pour sonder depuis l’hôte', () => {
    expect(hostProbeUrl('http://10.0.2.2:3001')).toBe('http://127.0.0.1:3001/');
    expect(hostProbeUrl('https://10.0.2.2')).toBe('https://127.0.0.1/');
    expect(hostProbeUrl('http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321/');
    expect(hostProbeUrl('https://api.example.test')).toBe('https://api.example.test/');
    expect(hostProbeUrl('pas une url')).toBeNull();
  });

  it('classe une réponse HTTP : prête, à authentifier ou en panne', () => {
    expect(classifyHttp(200)).toBe('ok');
    expect(classifyHttp(204)).toBe('ok');
    expect(classifyHttp(301)).toBe('ok');
    expect(classifyHttp(401)).toBe('unauthorized');
    expect(classifyHttp(403)).toBe('unauthorized');
    expect(classifyHttp(404)).toBe('down');
    expect(classifyHttp(502)).toBe('down');
    expect(classifyHttp(0)).toBe('down');
  });

  it('applique le seuil disque de 4 Go', () => {
    expect(diskVerdict(3.9 * 1024 ** 3, 4).ok).toBe(false);
    expect(diskVerdict(4 * 1024 ** 3, 4).ok).toBe(true);
    expect(diskVerdict(0, 4).freeGb).toBe(0);
  });

  it('juge un appareil connecté, hors ligne ou absent', () => {
    const connected = adbVerdict('List of devices attached\nemulator-5554\tdevice\n');
    expect(connected).toMatchObject({ ok: true, serial: 'emulator-5554', offline: null });

    const offline = adbVerdict('List of devices attached\nemulator-5554\toffline\n');
    expect(offline.ok).toBe(false);
    expect(offline.offline).toBe('emulator-5554');

    const none = adbVerdict('List of devices attached\n\n');
    expect(none).toMatchObject({ ok: false, serial: null, detail: 'aucun appareil adb' });
  });

  it('ne considère le démarrage terminé que pour sys.boot_completed=1', () => {
    expect(bootVerdict('1\n').booted).toBe(true);
    expect(bootVerdict('0').booted).toBe(false);
    expect(bootVerdict('').booted).toBe(false);
    expect(bootVerdict(undefined).booted).toBe(false);
  });
});
