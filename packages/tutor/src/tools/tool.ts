// Shape of a tutor action (docs/architecture/ai.md §3). SPEC-508 consumes this registry to declare
// strict tools to the model; SPEC-512 provides the first action and its guard.
import type { z } from 'zod';

import type { AppError, Result } from '@learny/core';

export interface TutorTool<Context, Input, Output> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<Input>;
  readonly outputSchema: z.ZodType<Output>;
  /** Pure authorization: called before `execute`, therefore before any network or database call. */
  guard(context: Context, input: Input): AppError | null;
  execute(context: Context, input: Input): Promise<Result<Output>>;
}
