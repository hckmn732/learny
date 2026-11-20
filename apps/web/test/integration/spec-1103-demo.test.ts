import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Spec1103Demo from '../../components/sdd-demos/spec-1103';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('[SPEC-1103] API deployment demo', () => {
  it('renders the Compose topology, all role, health and served functions', async () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://api.learny.test');
    vi.stubEnv('LEARNY_API_ROLE', 'all');
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url =
          input instanceof URL
            ? input.href
            : typeof input === 'string'
              ? input
              : input.url;
        if (url.endsWith('/health')) {
          return Promise.resolve(Response.json({ status: 'ok' }));
        }
        return Promise.resolve(
          Response.json({
            function_count: 1,
            functions: [{ id: 'learny-sdd-demo-job' }],
          }),
        );
      }),
    );

    const html = renderToStaticMarkup(await Spec1103Demo());

    expect(html.match(/data-testid="spec-1103-compose"/g)).toHaveLength(4);
    expect(html).toContain('data-testid="spec-1103-role-value"');
    expect(html).toContain('>all<');
    expect(html).toContain('data-testid="spec-1103-health"');
    expect(html).toContain('>ok<');
    expect(html).toContain('learny-sdd-demo-job');
    expect(html).toContain('docker/compose.selfhost.yml');
  });
});
