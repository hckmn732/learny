import type { AnyRoute } from '@learny/contracts';
import type { HandlerArgs, RouteOutcome } from '@learny/http/route-handler';

/**
 * SPEC-1004 ET-2 — one route implementation is exactly what `handler(route, fn)` of `@learny/http`
 * already expects: the parsed arguments in, a `Result` (or a raw `Response`) out.
 */
export type RouteImplementation<R extends AnyRoute> = (
  args: HandlerArgs<R>,
) => Promise<RouteOutcome<R>>;
