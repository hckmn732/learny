import type { ToolContext } from './types';

/**
 * Resolves the formation a tool call targets. `null` means the call has no accessible formation:
 * the caller answers `NOT_FOUND` without revealing whether the identifier exists (CL-2).
 */
export async function accessibleFormation(
  ctx: ToolContext,
  requested: string | undefined,
): Promise<string | null> {
  const formationId = requested ?? ctx.formationId;
  if (formationId === null) return null;
  const allowed = await ctx.runtime.canAccessFormation(ctx, formationId);
  return allowed ? formationId : null;
}

/** A module/chapter/notion target must belong to the formation already authorized for the task. */
export function inFormation(
  ref: { formationId: string } | null,
  formationId: string,
): boolean {
  return ref !== null && ref.formationId === formationId;
}
