import { handler } from '../../../../lib/api/handler';
import { healthResponse } from '../../../../lib/health';

export const dynamic = 'force-dynamic';

// Public route: no session required (docs/architecture/api.md §1). The wrapper adds the
// `x-request-id` correlation header and the structured request line (SPEC-010, EF-1). Only GET is
// exported: other methods answer 405.
const get = handler({ route: '/api/v1/health' }, () => healthResponse());

export function GET(
  request: Request = new Request('http://localhost/api/v1/health'),
): Promise<Response> {
  return get(request);
}
