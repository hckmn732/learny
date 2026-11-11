import { healthResponse } from '../../../../lib/health';

export const dynamic = 'force-dynamic';

// Public route: no session required (docs/architecture/api.md §1). Only GET is exported: other
// methods answer 405.
export function GET(): Promise<Response> {
  return healthResponse();
}
