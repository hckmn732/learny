// Minimal typed client of /api/v1 for the browser (SPEC-006, EF-5/ET-4). SPEC-201 extends it.
import { z } from 'zod';

import { AppError, ERROR_CATALOG, type ErrorCode } from '@learny/core';

export const API_BASE = '/api/v1';

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRequest<TInput, TOutput> {
  method: ApiMethod;
  /** Path under /api/v1, starting with `/` (e.g. `/health`). */
  path: string;
  /** JSON body, validated by `input` before anything is sent. */
  body?: TInput;
  input?: z.ZodType<TInput>;
  /** Schema of a successful response; for 204 it receives `undefined` (use `z.undefined()`). */
  output: z.ZodType<TOutput>;
  signal?: AbortSignal;
  /** Injectable transport (tests, demonstration); defaults to the global fetch. */
  fetch?: typeof fetch;
}

// RFC 9457 problem details, as produced by the API (docs/architecture/api.md §1).
const ProblemDetails = z.looseObject({
  type: z.string().optional(),
  title: z.string().optional(),
  status: z.number().int().optional(),
  detail: z.string().optional(),
  code: z.string().min(1).optional(),
  requestId: z.string().min(1).optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

const SAFE_PATH = /^\/(?!\/)[A-Za-z0-9\-._~%/]*(\?[A-Za-z0-9\-._~%&=+,]*)?$/;

function codeForStatus(status: number): ErrorCode {
  if (status === 404) return 'NOT_FOUND';
  if (status === 400) return 'VALIDATION_FAILED';
  if (status === 503) return 'SERVICE_UNAVAILABLE';
  return 'INTERNAL_ERROR';
}

function headerRequestId(response: Response): string | undefined {
  return response.headers.get('x-request-id') ?? undefined;
}

function withRequestId(
  status: number,
  requestId: string | undefined,
): { status: number; requestId?: string } {
  return requestId === undefined ? { status } : { status, requestId };
}

async function readJson(response: Response): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    const text = await response.text();
    return { ok: true, value: text === '' ? undefined : (JSON.parse(text) as unknown) };
  } catch {
    return { ok: false };
  }
}

async function toAppError(response: Response): Promise<AppError> {
  const contentType = response.headers.get('content-type') ?? '';
  const fallbackRequestId = headerRequestId(response);
  if (contentType.includes('application/problem+json')) {
    const json = await readJson(response);
    const problem = json.ok ? ProblemDetails.safeParse(json.value) : null;
    if (problem?.success === true) {
      const p = problem.data;
      const code = p.code ?? codeForStatus(response.status);
      const detail = p.detail ?? p.title ?? ERROR_CATALOG[codeForStatus(response.status)].title;
      const extra = withRequestId(response.status, p.requestId ?? fallbackRequestId);
      return new AppError(
        code,
        detail,
        p.errors === undefined ? extra : { ...extra, errors: p.errors },
      );
    }
    return new AppError(
      'INVALID_RESPONSE',
      ERROR_CATALOG.INVALID_RESPONSE.title,
      withRequestId(response.status, fallbackRequestId),
    );
  }
  const code = codeForStatus(response.status);
  return new AppError(
    code,
    ERROR_CATALOG[code].title,
    withRequestId(response.status, fallbackRequestId),
  );
}

/**
 * Sends one request and decodes it. Never retries (a mutation must not be replayed implicitly).
 * Every failure is an `AppError`: validation, network, error response or unexpected body.
 */
export async function apiFetch<TInput, TOutput>(
  req: ApiRequest<TInput, TOutput>,
): Promise<TOutput> {
  if (!SAFE_PATH.test(req.path) || req.path.includes('..')) {
    throw new AppError('VALIDATION_FAILED', 'Chemin d’API invalide.');
  }

  const hasBody = req.body !== undefined;
  let payload: string | undefined;
  if (hasBody) {
    let value: unknown = req.body;
    if (req.input !== undefined) {
      const parsed = req.input.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION_FAILED', ERROR_CATALOG.VALIDATION_FAILED.title, {
          errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      value = parsed.data;
    }
    payload = JSON.stringify(value);
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (hasBody) headers['Content-Type'] = 'application/json';
  const init: RequestInit = { method: req.method, headers, credentials: 'same-origin' };
  if (payload !== undefined) init.body = payload;
  if (req.signal !== undefined) init.signal = req.signal;

  const send = req.fetch ?? fetch;
  let response: Response;
  try {
    response = await send(`${API_BASE}${req.path}`, init);
  } catch (cause) {
    throw new AppError('NETWORK_ERROR', 'Le serveur est injoignable. Vérifiez votre connexion.', {
      cause,
    });
  }

  if (!response.ok) throw await toAppError(response);

  const requestId = headerRequestId(response);
  let value: unknown;
  if (response.status === 204) {
    value = undefined;
  } else {
    const json = await readJson(response);
    if (!json.ok) {
      throw new AppError(
        'INVALID_RESPONSE',
        ERROR_CATALOG.INVALID_RESPONSE.title,
        withRequestId(response.status, requestId),
      );
    }
    value = json.value;
  }
  const parsed = req.output.safeParse(value);
  if (!parsed.success) {
    throw new AppError(
      'INVALID_RESPONSE',
      ERROR_CATALOG.INVALID_RESPONSE.title,
      withRequestId(response.status, requestId),
    );
  }
  return parsed.data;
}
