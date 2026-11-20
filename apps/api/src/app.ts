import { Hono } from 'hono';
import type { Inngest } from 'inngest';
import { serve } from 'inngest/hono';

import type { ErrorReporter } from '@learny/core';
import { AppError } from '@learny/core';
import { configureHttp } from '@learny/http';
import { apiProblemResponse } from '@learny/http/problem';
import { resolveApiRequestId } from '@learny/http/request-id';
import {
  createFunctions,
  functions as sharedFunctions,
  inngest,
  sddDemoStore,
  setJobErrorReporter,
} from '@learny/jobs';

import { methodsForPath, mountApiRoutes } from './mount';

export const DEFAULT_PORT = 3001;
export const INNGEST_PATH = '/api/inngest';

type Env = Readonly<Record<string, string | undefined>>;

export interface ApiHealth {
  status: 'ok';
  version: string;
  commit: string;
}

export interface AppOptions {
  client?: Inngest;
  functions?: Parameters<typeof serve>[0]['functions'];
  env?: Env;
  reporter?: ErrorReporter;
}

export function getApiHealth(env: Env = process.env): ApiHealth {
  const version = env.APP_VERSION ?? '';
  const commit = env.GIT_COMMIT ?? '';
  return {
    status: 'ok',
    version: /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/.test(version) ? version : 'dev',
    commit: /^[0-9a-f]{7,40}$/i.test(commit) ? commit : 'unknown',
  };
}

export function createApp(options: AppOptions = {}): Hono {
  const app = new Hono();
  const client = options.client ?? inngest;
  if (options.reporter !== undefined) {
    const reporter = options.reporter;
    configureHttp({ reporter });
    setJobErrorReporter((report) => {
      reporter.capture(report.error, {
        route: `job:${report.job}`,
        ...(report.jobId === undefined ? {} : { jobId: report.jobId }),
        ...(report.userId === undefined ? {} : { userId: report.userId }),
      });
    });
  }

  const registry =
    options.functions ??
    (options.reporter === undefined
      ? sharedFunctions
      : createFunctions(client, {
          demoStore: sddDemoStore,
          reportError: (report) => {
            options.reporter?.capture(report.error, {
              ...(report.requestId === undefined ? {} : { requestId: report.requestId }),
              ...(report.jobId === undefined ? {} : { jobId: report.jobId }),
            });
          },
        }));

  app.get('/health', (context) => {
    const requestId = resolveApiRequestId(context.req.header('x-request-id'));
    context.header('x-request-id', requestId);
    context.header('cache-control', 'no-store');
    return context.json(getApiHealth(options.env));
  });
  mountApiRoutes(app, { omitSpecial: ['inngest'] });
  const inngestHandler = serve({ client, functions: registry });
  app.on(['GET', 'POST', 'PUT'], INNGEST_PATH, (context) => inngestHandler(context));

  app.all('*', (context) => {
    const pathname = new URL(context.req.url).pathname;
    const requestId = resolveApiRequestId(context.req.header('x-request-id'));
    const methods = methodsForPath(pathname);
    const response = apiProblemResponse(
      new AppError(
        methods.length === 0 ? 'NOT_FOUND' : 'METHOD_NOT_ALLOWED',
        methods.length === 0 ? 'Ressource introuvable.' : 'Méthode non prise en charge.',
        methods.length === 0 ? undefined : { status: 405 },
      ),
      requestId,
    );
    if (methods.length > 0) response.headers.set('allow', methods.join(', '));
    return response;
  });

  app.onError((error, context) => {
    options.reporter?.capture(error, { route: new URL(context.req.url).pathname });
    const requestId = resolveApiRequestId(context.req.header('x-request-id'));
    return apiProblemResponse(new Error('internal'), requestId);
  });
  return app;
}
