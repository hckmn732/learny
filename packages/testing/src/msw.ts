// Deterministic HTTP doubles for component and integration tests (MSW).
import { http, HttpResponse, type RequestHandler } from 'msw';
import { setupServer, type SetupServer } from 'msw/node';

/** Any unmocked request fails the test: no real service is ever called. */
export function createMockServer(...handlers: RequestHandler[]): SetupServer {
  const server = setupServer(...handlers);
  const listen = server.listen.bind(server);
  server.listen = (options) => {
    listen({ onUnhandledFrame: 'error', ...options });
  };
  return server;
}

/** JSON handler returning a fixed body. */
export function jsonHandler(
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  url: string,
  body: unknown,
  status = 200,
): RequestHandler {
  return http[method](url, () => HttpResponse.json(body as Record<string, unknown>, { status }));
}

export { http, HttpResponse };
