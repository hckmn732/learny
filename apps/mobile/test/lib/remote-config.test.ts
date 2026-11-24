import type { MobileConfig } from '../../src/config';
import {
  PUBLIC_CONFIG_CACHE_KEY,
  fetchPublicConfig,
  mergePublicConfig,
  resolveRemoteConfig,
  type ConfigCache,
} from '../../src/lib/remote-config';

const BUILD: MobileConfig = {
  apiUrl: 'https://api.learny.test/',
  supabaseUrl: 'https://build.supabase.test',
  supabaseAnonKey: 'anon-build',
  webUrl: 'https://build.learny.test',
  enableSddPages: false,
  clockFixedAt: null,
};

const REMOTE = {
  supabaseUrl: 'https://server.supabase.test',
  supabaseAnonKey: 'anon-server',
  webUrl: 'https://learny.test',
  vapidPublicKey: 'BPublic',
  stripePublishableKey: null,
};

function memoryCache(initial: Record<string, string> = {}): ConfigCache & {
  store: Map<string, string>;
} {
  const store = new Map(Object.entries(initial));
  return {
    store,
    getItem: (key) => Promise.resolve(store.get(key) ?? null),
    setItem: (key, value) => {
      store.set(key, value);
      return Promise.resolve();
    },
  };
}

function answering(body: unknown, status = 200): jest.Mock {
  return jest.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

const offline = jest.fn(() => Promise.reject(new TypeError('Network request failed')));

describe('[SPEC-009] configuration publique (ADR-4007)', () => {
  it('lit GET /api/v1/config/public sur l URL de l API', async () => {
    const fetchImpl = answering(REMOTE);

    await expect(fetchPublicConfig(BUILD.apiUrl, fetchImpl)).resolves.toEqual(REMOTE);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.learny.test/api/v1/config/public',
      expect.objectContaining({ headers: { accept: 'application/json' } }),
    );
  });

  it('renvoie null pour une erreur reseau, un statut ou une forme invalide', async () => {
    await expect(fetchPublicConfig(BUILD.apiUrl, offline)).resolves.toBeNull();
    await expect(fetchPublicConfig(BUILD.apiUrl, answering(REMOTE, 503))).resolves.toBeNull();
    await expect(fetchPublicConfig(BUILD.apiUrl, answering({ nope: 1 }))).resolves.toBeNull();
  });

  it('garde les valeurs du build quand le serveur ne fournit rien', () => {
    const merged = mergePublicConfig(BUILD, {
      ...REMOTE,
      supabaseUrl: null,
      supabaseAnonKey: null,
      webUrl: null,
    });
    expect(merged).toEqual(BUILD);
  });

  it('prefere la reponse du serveur et la met en cache', async () => {
    const cache = memoryCache();

    const result = await resolveRemoteConfig(BUILD, { fetch: answering(REMOTE), cache });

    expect(result.source).toBe('server');
    expect(result.config.supabaseUrl).toBe('https://server.supabase.test');
    expect(result.config.supabaseAnonKey).toBe('anon-server');
    expect(result.config.webUrl).toBe('https://learny.test');
    expect(result.config.apiUrl).toBe(BUILD.apiUrl);
    expect(JSON.parse(cache.store.get(PUBLIC_CONFIG_CACHE_KEY) ?? '{}')).toEqual(REMOTE);
  });

  it('hors ligne, reprend la derniere reponse en cache puis le build', async () => {
    const cache = memoryCache({ [PUBLIC_CONFIG_CACHE_KEY]: JSON.stringify(REMOTE) });

    const fromCache = await resolveRemoteConfig(BUILD, { fetch: offline, cache });
    const fromBuild = await resolveRemoteConfig(BUILD, { fetch: offline, cache: memoryCache() });
    const corrupted = await resolveRemoteConfig(BUILD, {
      fetch: offline,
      cache: memoryCache({ [PUBLIC_CONFIG_CACHE_KEY]: '{oops' }),
    });

    expect(fromCache).toEqual({ config: mergePublicConfig(BUILD, REMOTE), source: 'cache' });
    expect(fromBuild).toEqual({ config: BUILD, source: 'build' });
    expect(corrupted.source).toBe('build');
  });
});
