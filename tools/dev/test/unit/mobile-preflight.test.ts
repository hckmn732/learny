// Tests du préflight de campagne mobile (ADR-3015 § 5).
//
// Les fonctions pures sont testées ici : lecture/écriture de `e2e.env`, cohérence des clés,
// classement d'une réponse de port public (périmé / service arrêté), seuil disque et verdict de
// l'agent. Le CLI fait les appels réseau et n'est pas testé unitairement.
import { describe, expect, it } from 'vitest';

import {
  agentVerdict,
  checkEnv,
  classifyPortResponse,
  diskVerdict,
  parseEnvFile,
  PUBLISHED_PORTS,
  REQUIRED_KEYS,
  republishCapability,
  rewriteEnvFile,
} from '../../mobile-preflight.mjs';

const COMPLETE = {
  EXPO_PUBLIC_API_URL: 'https://api.example.test',
  EXPO_PUBLIC_SUPABASE_URL: 'https://supabase.example.test',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  MOBILE_APK_URL: 'https://apk.example.test/app-release.apk',
  MOBILE_DEVICE_AGENT_URL: 'https://agent.example.test',
  MOBILE_DEVICE_AGENT_TOKEN: 'jeton',
};

describe('[SPEC-3001] préflight de campagne mobile', () => {
  it('lit et réécrit e2e.env sans perdre les commentaires ni l’ordre', () => {
    const content = [
      '# commentaire',
      'EXPO_PUBLIC_API_URL=https://vieux.test',
      '',
      'MOBILE_AVD=agent37',
    ].join('\n');

    const env = parseEnvFile(content);
    expect(env.EXPO_PUBLIC_API_URL).toBe('https://vieux.test');
    expect(env.MOBILE_AVD).toBe('agent37');

    const rewritten = rewriteEnvFile(content, { EXPO_PUBLIC_API_URL: 'https://neuf.test' });
    expect(rewritten.split('\n')[0]).toBe('# commentaire');
    expect(rewritten).toContain('EXPO_PUBLIC_API_URL=https://neuf.test');
    expect(rewritten).toContain('MOBILE_AVD=agent37');
  });

  it('ajoute une clé absente à la fin du fichier', () => {
    const rewritten = rewriteEnvFile('MOBILE_AVD=agent37', {
      MOBILE_APK_URL: 'https://apk/app.apk',
    });

    expect(rewritten.split('\n')).toEqual([
      'MOBILE_AVD=agent37',
      'MOBILE_APK_URL=https://apk/app.apk',
    ]);
  });

  it('exige les clés sans lesquelles la campagne ne démarre pas', () => {
    expect(checkEnv({}).missing.sort()).toEqual([...REQUIRED_KEYS].sort());
    expect(checkEnv(COMPLETE).ok).toBe(true);
  });

  it('refuse 10.0.2.2 en mode agent et un agent sans jeton', () => {
    const env = { ...COMPLETE, EXPO_PUBLIC_API_URL: 'http://10.0.2.2:3001' };
    const withoutToken = { ...COMPLETE, MOBILE_DEVICE_AGENT_TOKEN: '' };

    expect(checkEnv(env).ok).toBe(false);
    expect(checkEnv(env).problems.join(' ')).toContain('10.0.2.2');
    expect(checkEnv(withoutToken).problems.join(' ')).toContain('MOBILE_DEVICE_AGENT_TOKEN');
  });

  it('accepte 10.0.2.2 quand il n’y a pas d’agent (transport local)', () => {
    const env = {
      ...COMPLETE,
      EXPO_PUBLIC_API_URL: 'http://10.0.2.2:3001',
      MOBILE_DEVICE_AGENT_URL: '',
      MOBILE_DEVICE_AGENT_TOKEN: '',
    };

    expect(checkEnv(env).ok).toBe(true);
  });

  it('distingue un port périmé d’un service arrêté', () => {
    expect(classifyPortResponse(200)).toBe('ok');
    expect(classifyPortResponse(405)).toBe('ok');
    expect(classifyPortResponse(404)).toBe('stale');
    expect(classifyPortResponse(0)).toBe('stale');
    expect(classifyPortResponse(502)).toBe('down');
    expect(classifyPortResponse(503)).toBe('down');
    expect(classifyPortResponse(401)).toBe('unauthorized');
  });

  it('applique le seuil disque de 4 Go', () => {
    expect(diskVerdict(3.9 * 1024 ** 3, 4).ok).toBe(false);
    expect(diskVerdict(4 * 1024 ** 3, 4).ok).toBe(true);
    expect(diskVerdict(0, 4).freeGb).toBe(0);
  });

  it('juge l’agent libre, occupé ou injoignable', () => {
    expect(agentVerdict(null).ok).toBe(false);
    expect(agentVerdict({ ok: true, busy: false, version: 2 })).toMatchObject({ ok: true });
    const busy = agentVerdict({ ok: true, busy: true, jobId: 'j-1', version: 2 });
    expect(busy.ok).toBe(false);
    expect(busy.detail).toContain('j-1');
  });

  it('déclare la republication possible seulement avec une clé', () => {
    expect(republishCapability({ ...COMPLETE }, () => '').ok).toBe(false);
    expect(republishCapability({ ...COMPLETE }, () => 'cle').ok).toBe(true);
    expect(republishCapability({ ...COMPLETE, AGENT37_API_KEY: 'cle' }, () => '').key).toBe('cle');
  });

  it('décrit les ports publiés d’une campagne (APK, API, Supabase, agent)', () => {
    expect(PUBLISHED_PORTS.map((entry) => entry.label)).toEqual([
      'apk',
      'api',
      'supabase',
      'device-agent',
    ]);
    expect(PUBLISHED_PORTS.filter((entry) => entry.instance === 'phone')).toHaveLength(1);
  });
});
