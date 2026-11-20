import { Hono } from 'hono';

import {
  ROUTE_IMPLEMENTATIONS,
  SPECIAL_HANDLERS,
  type RouteImplementation,
  type SpecialHandler,
} from '@learny/api-routes';
import type { AnyRoute, HttpMethod } from '@learny/contracts';
import { ROUTES } from '@learny/contracts';
import { routeHandler } from '@learny/http/route-handler';

export interface MountedRoute {
  method: HttpMethod | 'ALL';
  path: string;
}

const METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export function mountedRoutes(): MountedRoute[] {
  return [
    { method: 'ALL', path: '/api/inngest' },
    ...Object.entries(ROUTE_IMPLEMENTATIONS).map(([key]) => {
      const route = (ROUTES as Record<string, AnyRoute>)[key];
      if (route === undefined) throw new Error(`route inconnue du registre : ${key}`);
      return { method: route.method, path: route.path };
    }),
    ...Object.values(SPECIAL_HANDLERS).map(({ method, path }) => ({ method, path })),
  ];
}

function mountStandard(app: Hono): void {
  const routes = ROUTES as Record<string, AnyRoute>;
  const implementations = ROUTE_IMPLEMENTATIONS as Record<string, RouteImplementation<AnyRoute>>;
  for (const [id, implementation] of Object.entries(implementations)) {
    const route = routes[id];
    if (route === undefined) throw new Error(`route inconnue du registre : ${id}`);
    const handler = routeHandler(route, implementation);
    app.on(route.method, route.path, (context) =>
      handler(context.req.raw, { params: Promise.resolve(context.req.param()) }),
    );
  }
}

function mountSpecial(app: Hono, omitted: readonly string[] = []): void {
  const omittedKeys = new Set(omitted);
  const handlers: Record<string, SpecialHandler> = SPECIAL_HANDLERS;
  for (const [key, entry] of Object.entries(handlers)) {
    if (omittedKeys.has(key)) continue;
    const methods = entry.method === 'ALL' ? [...METHODS] : [entry.method];
    app.on(methods, entry.path, async (context) =>
      entry.handle(context.req.raw, context.req.param()),
    );
  }
}

export function mountApiRoutes(app: Hono, options: { omitSpecial?: readonly string[] } = {}): void {
  mountStandard(app);
  mountSpecial(app, options.omitSpecial);
}

export function pathMatches(template: string, pathname: string): boolean {
  const pattern = template
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return '[^/]+';
    })
    .join('/');
  return new RegExp(`^${pattern}$`).test(pathname);
}

export function methodsForPath(pathname: string): HttpMethod[] {
  const methods = new Set<HttpMethod>();
  for (const route of mountedRoutes()) {
    if (!pathMatches(route.path, pathname)) continue;
    if (route.method === 'ALL') for (const method of METHODS) methods.add(method);
    else methods.add(route.method);
  }
  return [...methods].sort();
}
