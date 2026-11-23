import { randomUUID } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { AppError, toProblem } from '@learny/core';

const DEFAULT_API_INTERNAL_URL = 'http://127.0.0.1:3001';

function forwardedHost(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? request.nextUrl.host
  );
}

function forwardedFor(request: NextRequest): string | null {
  return request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip');
}

function requestId(request: NextRequest): string {
  return request.headers.get('x-request-id') ?? randomUUID();
}

function unavailable(id: string): NextResponse {
  const body = toProblem(new AppError('API_UNAVAILABLE', 'API momentanément indisponible.'), id);
  return NextResponse.json(body, {
    status: 502,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/problem+json',
      'x-request-id': id,
    },
  });
}

export async function relayToApi(request: NextRequest): Promise<NextResponse> {
  const id = requestId(request);
  const origin = process.env.API_INTERNAL_URL ?? DEFAULT_API_INTERNAL_URL;
  const target = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, origin);
  const headers = new Headers(request.headers);
  headers.delete('x-learny-proxy-secret');
  const secret = process.env.API_PROXY_SECRET;
  if (secret !== undefined && secret !== '') headers.set('x-learny-proxy-secret', secret);
  headers.set('x-forwarded-host', forwardedHost(request));
  headers.set('x-forwarded-proto', request.nextUrl.protocol.replace(':', ''));
  const address = forwardedFor(request);
  if (address !== null) headers.set('x-forwarded-for', address);
  headers.set('x-request-id', id);

  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body:
        request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS'
          ? undefined
          : request.body,
      duplex: 'half',
      // A redirect of the API (the e-mailed link callback answers 302 with the session cookies)
      // is the browser's to follow: following it here would serve the destination page under
      // the callback URL and drop the cookies of the redirect.
      redirect: 'manual',
      signal: request.signal,
    } as RequestInit & { duplex: 'half' });
    const responseHeaders = new Headers(response.headers);
    if (!responseHeaders.has('x-request-id')) responseHeaders.set('x-request-id', id);
    // The proxy only relays an absolute `location`: a relative one of the API (the callback
    // redirect) is resolved against the URL the browser requested.
    const location = responseHeaders.get('location');
    if (location !== null)
      responseHeaders.set('location', new URL(location, request.url).toString());
    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    if (request.signal.aborted) throw error;
    return unavailable(id);
  }
}
