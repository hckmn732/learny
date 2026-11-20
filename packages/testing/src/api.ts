import { testApiHandler, type NtarhInitAppRouter } from 'next-test-api-route-handler';

export type ApiTarget = 'next' | 'hono';

interface ApiHarnessFetch {
  (init?: RequestInit): Promise<Response>;
}

export interface ApiHarnessContext {
  fetch: ApiHarnessFetch;
}

export interface ApiRequestOptions {
  appHandler: NtarhInitAppRouter['appHandler'];
  url: string;
  params?: Record<string, string | string[]>;
  test: (context: ApiHarnessContext) => Promise<void>;
}

export interface ApiTestOptions {
  env?: Readonly<Record<string, string | undefined>>;
}

interface ApiTestApp {
  request(input: RequestInfo | URL, requestInit?: RequestInit): Response | Promise<Response>;
}

type ApiAppFactory = (options?: ApiTestOptions) => ApiTestApp;

let createHonoApp: ApiAppFactory | undefined;

export function setApiAppFactory(factory: ApiAppFactory): void {
  createHonoApp = factory;
}

export async function requestApi(
  target: ApiTarget,
  options: ApiRequestOptions,
  appOptions: ApiTestOptions = {},
): Promise<void> {
  if (target === 'next') {
    await testApiHandler(options);
    return;
  }
  if (createHonoApp === undefined) throw new Error('Fabrique Hono non enregistrée pour les tests.');
  const app = createHonoApp(appOptions);
  await options.test({
    fetch: async (init = {}) => app.request(options.url, init),
  });
}
