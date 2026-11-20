import type { HttpMethod } from '@learny/contracts';

import { createApp } from '../../src/app';

type Segment = { params: Promise<Record<string, string | string[]>> };

export function honoRoute(
  fallbackPath: string,
  fallbackMethod: HttpMethod,
): (request?: Request, segment?: Segment) => Promise<Response> {
  return async (request) => {
    const target =
      request ??
      new Request(new URL(fallbackPath, 'http://localhost'), { method: fallbackMethod });
    return createApp().request(target);
  };
}
