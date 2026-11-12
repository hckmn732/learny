// `instruction` brick (SPEC-501 ET-3, ADR-0027, ADR-0150): a practical task with a structured
// production. The table variant carries the header fields, columns, row bounds and sum checks of the
// mockup (Exercice.dc.html).
import { z } from 'zod';

import { columnKey, criterionKey, integer, optionalText, sourcesSchema, text } from '../../common';

export const INSTRUCTION_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/markdown',
] as const;

export const instructionColumnSchema = z
  .object({
    key: columnKey,
    label: text(1, 60),
    type: z.enum(['text', 'number', 'select']),
    options: z
      .array(
        z
          .object({
            value: text(1, 40),
            label: text(1, 80),
          })
          .strict(),
      )
      .min(1)
      .max(20)
      .optional(),
  })
  .strict();

export type InstructionColumn = z.infer<typeof instructionColumnSchema>;

/** ADR-0289 — a sum check value is a short label; the bound is 1 to 80 characters. */
export const instructionCheckValue = text(1, 80);

export const instructionTableCheckSchema = z
  .object({
    type: z.literal('sum_equal'),
    numberColumn: columnKey,
    groupColumn: columnKey,
    left: z.array(instructionCheckValue).min(1).max(10),
    right: z.array(instructionCheckValue).min(1).max(10),
    leftLabel: optionalText(1, 20),
    rightLabel: optionalText(1, 20),
    sideColumnLabel: optionalText(1, 20),
  })
  .strict();

export type InstructionTableCheck = z.infer<typeof instructionTableCheckSchema>;

const textProductionSchema = z
  .object({
    kind: z.literal('text'),
    minChars: integer(0, 2000).default(0),
    maxChars: integer(50, 10000),
  })
  .strict()
  .refine((production) => production.minChars <= production.maxChars, {
    message: 'minChars must not exceed maxChars.',
    path: ['minChars'],
  });

const fileProductionSchema = z
  .object({
    kind: z.literal('file'),
    accept: z.array(z.enum(INSTRUCTION_MIME_TYPES)).min(1).max(6),
    maxSizeMb: integer(1, 50),
  })
  .strict();

const linkProductionSchema = z.object({ kind: z.literal('link') }).strict();

const tableProductionSchema = z
  .object({
    kind: z.literal('table'),
    fields: z.array(instructionColumnSchema).max(4).default([]),
    columns: z.array(instructionColumnSchema).min(1).max(8),
    minRows: integer(1, 20),
    maxRows: integer(1, 50),
    initialRows: integer(1, 50),
    checks: z.array(instructionTableCheckSchema).max(3).default([]),
  })
  .strict()
  .refine((table) => table.maxRows >= table.minRows, {
    message: 'maxRows must be greater than or equal to minRows.',
    path: ['maxRows'],
  })
  .refine((table) => table.initialRows >= table.minRows && table.initialRows <= table.maxRows, {
    message: 'initialRows must be between minRows and maxRows.',
    path: ['initialRows'],
  });

export const instructionProductionSchema = z.discriminatedUnion('kind', [
  textProductionSchema,
  fileProductionSchema,
  linkProductionSchema,
  tableProductionSchema,
]);

export type InstructionProduction = z.infer<typeof instructionProductionSchema>;

export const instructionCriterionSchema = z
  .object({
    key: criterionKey,
    label: text(2, 120),
    points: integer(1, 10),
    description: text(2, 400),
  })
  .strict();

export type InstructionCriterion = z.infer<typeof instructionCriterionSchema>;

export const instructionSchema = z
  .object({
    title: text(3, 120),
    taskMd: text(10, 4000),
    data: z.array(text(1, 80)).max(8).default([]),
    deliverable: text(3, 300),
    production: instructionProductionSchema,
    explanationPrompt: z.string().trim().min(3).max(300).nullable(),
    hints: z.array(text(5, 400)).max(2).default([]),
    criteria: z.array(instructionCriterionSchema).min(1).max(8),
    estimatedMinutes: integer(5, 120),
    passPoints: integer(1, 10).default(8),
    sources: sourcesSchema,
  })
  .strict();

export type InstructionPayload = z.infer<typeof instructionSchema>;
