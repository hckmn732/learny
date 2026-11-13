// Response schemas of an instruction brick (SPEC-502 ET-1): text, file, link and structured table
// productions. Table row bounds and text bounds come from the payload fixed at creation.
import { z } from 'zod';

import { err, ok, type Result } from '@learny/core';

import { invalidResponse, zodGradeIssues } from '../../grade-support';
import type { GradeError } from '../../grade-types';

import type { InstructionProduction } from './schema';

const explanationSchema = z.string().trim().max(2000).optional();

export interface TableResponse {
  fields: Record<string, string>;
  rows: Array<Record<string, string>>;
  explanation?: string | undefined;
}

export interface TextResponse {
  text: string;
  explanation?: string | undefined;
}

export interface FileResponse {
  resourceId: string;
  explanation?: string | undefined;
}

export interface LinkResponse {
  url: string;
  explanation?: string | undefined;
}

export type InstructionResponse = TableResponse | TextResponse | FileResponse | LinkResponse;

export const instructionTableResponseSchema = z
  .object({
    fields: z.record(z.string(), z.string().max(2000)),
    rows: z.array(z.record(z.string(), z.string().max(2000))),
    explanation: explanationSchema,
  })
  .strict();

export const instructionTextResponseSchema = z
  .object({
    text: z.string().max(10_000),
    explanation: explanationSchema,
  })
  .strict();

export const instructionFileResponseSchema = z
  .object({
    resourceId: z.uuid(),
    explanation: explanationSchema,
  })
  .strict();

export const instructionLinkResponseSchema = z
  .object({
    url: z.url().refine((value) => value.startsWith('https://'), 'The link must use HTTPS.'),
    explanation: explanationSchema,
  })
  .strict();

function parseTableResponse(
  production: Extract<InstructionProduction, { kind: 'table' }>,
  response: unknown,
): Result<TableResponse, GradeError> {
  const parsed = instructionTableResponseSchema.safeParse(response);
  if (!parsed.success) return err(invalidResponse(zodGradeIssues(parsed.error)));
  const rows = parsed.data.rows.length;
  if (rows < production.minRows || rows > production.maxRows) {
    return err(
      invalidResponse([
        {
          path: 'response.rows',
          message: `The table must contain between ${String(production.minRows)} and ${String(production.maxRows)} rows (found ${String(rows)}).`,
        },
      ]),
    );
  }
  return ok(parsed.data);
}

function parseTextResponse(
  production: Extract<InstructionProduction, { kind: 'text' }>,
  response: unknown,
): Result<TextResponse, GradeError> {
  const parsed = instructionTextResponseSchema.safeParse(response);
  if (!parsed.success) return err(invalidResponse(zodGradeIssues(parsed.error)));
  const length = parsed.data.text.length;
  if (length < production.minChars || length > production.maxChars) {
    return err(
      invalidResponse([
        {
          path: 'response.text',
          message: `The text must contain between ${String(production.minChars)} and ${String(production.maxChars)} characters (found ${String(length)}).`,
        },
      ]),
    );
  }
  return ok(parsed.data);
}

/** Parses a production response against the bounds fixed on the brick at creation (ET-1). */
export function parseInstructionResponse(
  production: InstructionProduction,
  response: unknown,
): Result<InstructionResponse, GradeError> {
  switch (production.kind) {
    case 'table':
      return parseTableResponse(production, response);
    case 'text':
      return parseTextResponse(production, response);
    case 'file': {
      const parsed = instructionFileResponseSchema.safeParse(response);
      return parsed.success ? ok(parsed.data) : err(invalidResponse(zodGradeIssues(parsed.error)));
    }
    case 'link': {
      const parsed = instructionLinkResponseSchema.safeParse(response);
      return parsed.success ? ok(parsed.data) : err(invalidResponse(zodGradeIssues(parsed.error)));
    }
  }
}
