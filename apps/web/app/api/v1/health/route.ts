import { getHealth } from '../../../../lib/health';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json(getHealth(), {
    status: 200,
    headers: { 'cache-control': 'no-store' },
  });
}
