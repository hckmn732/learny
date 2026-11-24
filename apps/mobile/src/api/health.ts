// Health check of the API, through the shared client (SPEC-3001 EF-2, CL-1).
// The page shows « API joignable » or « API injoignable » with the error code of the client; a
// failure never throws in the render pass.
import { createApiClient } from '@learny/api-client';
import { HealthResponse } from '@learny/contracts';
import { isAppError } from '@learny/core';

export type HealthCheck =
  | { readonly status: 'ok'; readonly version: string | null; readonly database: string }
  | { readonly status: 'unreachable'; readonly code: string };

/** Error code shown when the transport itself fails before any HTTP answer (CL-1). */
export const UNREACHABLE_CODE = 'NETWORK_ERROR';

/**
 * Calls `GET /api/v1/health` with the client of the mobile application.
 * `fetchImpl` is injectable so the unit tests never touch the network.
 */
export async function checkApiHealth(
  apiUrl: string,
  fetchImpl?: typeof fetch,
): Promise<HealthCheck> {
  const client = createApiClient({
    baseUrl: `${apiUrl}/api/v1`,
    ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
  });

  try {
    const health = await client.apiFetch({
      method: 'GET',
      path: '/health',
      output: HealthResponse,
    });
    return { status: 'ok', version: health.version, database: health.database };
  } catch (error) {
    if (isAppError(error)) return { status: 'unreachable', code: error.code };
    return { status: 'unreachable', code: UNREACHABLE_CODE };
  }
}
