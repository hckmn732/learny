import { z } from 'zod';

// Building blocks shared by every contract (SPEC-201 ET-1).
export const Uuid = z.uuid();
export const IsoDateTime = z.iso.datetime({ offset: true });
export const CivilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** `?cursor=&limit=` (docs/architecture/api.md §1, EF-6). */
export const PaginationQuery = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

/** Page of a list: `{ items, nextCursor }`. */
export const page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

/** RFC 9457 problem details returned by every error of `/api/v1/*` (EF-1). */
export const ProblemDetails = z.object({
  type: z.url(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
  requestId: z.string(),
  errors: z
    .array(z.object({ code: z.string().optional(), path: z.string(), message: z.string() }))
    .optional(),
});
export type ProblemDetails = z.infer<typeof ProblemDetails>;

/** 202 answer of an asynchronous treatment. */
export const JobAccepted = z.object({ jobId: z.string() });
export type JobAccepted = z.infer<typeof JobAccepted>;

/** Marker of a route without a body (204). */
export const Empty = z.undefined();
