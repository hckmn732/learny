import type { z } from 'zod';

import type {
  CourseLanguage,
  InvalidOutputNotice,
  TutorProfile,
  TutorTask,
  TutorToolName,
} from '@learny/contracts';

import type { TutorToolRuntime } from './runtime';

/** Read-only identity of one tool call; it is built from the authenticated context only. */
export interface ToolScope {
  userId: string;
  formationId: string | null;
  profile: TutorProfile;
  task: TutorTask;
  /** Injected clock instant (ADR-0047). No tool ever reads the system time. */
  now: Date;
  /** Injected identifier source; the demo uses a deterministic counter. */
  newId: () => string;
}

/** Context handed to `guard` and `execute`: the user scope plus the application-service runtime. */
export interface ToolContext extends ToolScope {
  runtime: TutorToolRuntime;
}

export type GuardDecision =
  | { ok: true }
  | { ok: false; code: string; message: string };

export const ALLOW: GuardDecision = { ok: true };

/** A refusal never reveals whether a foreign object exists (CL-2). */
export function refuse(code: string, message: string): GuardDecision {
  return { ok: false, code, message };
}

export function notFound(): GuardDecision {
  return refuse('NOT_FOUND', 'Élément introuvable.');
}

/**
 * ET-1 — the exact shape exported by every file of `src/tools/`. The loop parses the input once
 * with `inputSchema`, then calls `guard` and `execute` in the same transaction.
 */
export interface TutorTool {
  name: TutorToolName;
  description: string;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  guard(ctx: ToolContext, input: unknown): Promise<GuardDecision>;
  execute(ctx: ToolContext, input: unknown): Promise<unknown>;
}

/**
 * Keeps the typed implementation of a tool and exposes the untyped contract used by the registry.
 * The loop has already parsed the payload; parsing again is cheap and protects direct callers.
 */
export function defineTutorTool<S extends z.ZodType, O extends z.ZodType>(definition: {
  name: TutorToolName;
  description: string;
  inputSchema: S;
  outputSchema: O;
  guard(ctx: ToolContext, input: z.infer<S>): Promise<GuardDecision>;
  execute(ctx: ToolContext, input: z.infer<S>): Promise<z.infer<O>>;
}): TutorTool {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    guard: (ctx, input) =>
      definition.guard(ctx, definition.inputSchema.parse(input) as z.infer<S>),
    execute: (ctx, input) =>
      definition.execute(ctx, definition.inputSchema.parse(input) as z.infer<S>),
  };
}

/** The notification port of EF-4; the database implementation lives in `runtime.ts`. */
export interface TutorNotifier {
  notifyInvalidOutput(scope: ToolScope, notice: InvalidOutputNotice): Promise<void>;
}

export type { CourseLanguage, TutorTask, TutorToolName };
