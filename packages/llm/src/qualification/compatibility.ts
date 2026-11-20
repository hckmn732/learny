import { z } from 'zod';

import type { AiTask } from '@learny/config';
import {
  AI_COMPATIBILITY_RESERVE_MESSAGES,
  type AiCompatibilityReserveCode,
  type AiTaskCompatibility,
  type QualificationCapabilities,
} from '@learny/contracts';
import type { Clock, Result } from '@learny/core';

import type { LlmSession } from '../session';
import { TASK_CONFIG, type TaskCapability } from '../tasks';

const TOOL_INPUT = z.object({ value: z.literal('ok') }).strict();
const STRUCTURED_OUTPUT = z
  .object({ compatible: z.literal(true), summary: z.string().min(1).max(200) })
  .strict();
const VISION_OUTPUT = z.object({ visible: z.literal(true) }).strict();
const RESERVE_ORDER: readonly AiCompatibilityReserveCode[] = [
  'STRUCTURED_UNRELIABLE',
  'NO_VISION',
  'NO_TOOLS',
];

const TRANSPARENT_PIXEL = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0,
  0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 0, 16, 5, 1, 1, 20,
  176, 157, 179, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

export type CompatibilitySession = Pick<LlmSession, 'step' | 'object'>;

export interface EvaluateTaskCompatibilityInput {
  credentialId: string;
  modelId: string;
  task: AiTask;
  clock: Clock;
  session: CompatibilitySession;
}

function reserve(
  code: AiCompatibilityReserveCode,
  reserves: Set<AiCompatibilityReserveCode>,
): void {
  reserves.add(code);
}

function failedProbe(
  result: Result<unknown>,
  reserves: Set<AiCompatibilityReserveCode>,
  code: AiCompatibilityReserveCode,
): void {
  if (!result.ok) reserve(code, reserves);
}

/**
 * Runs only the probes required by TASK_CONFIG. A provider failure is a reserve, never an
 * assignment error; brick validation and runtime correction remain owned by the normal task flow.
 */
export async function evaluateTaskCompatibility(
  input: EvaluateTaskCompatibilityInput,
): Promise<AiTaskCompatibility> {
  const startedAt = input.clock.now();
  const required: readonly TaskCapability[] = TASK_CONFIG[input.task].capabilities;
  const reserves = new Set<AiCompatibilityReserveCode>();

  if (required.includes('structured')) {
    const result = await input.session.object({
      system: [
        {
          text: 'Compatibility probe: return the exact structured value requested. No explanation.',
          cache: false,
        },
      ],
      messages: [
        {
          role: 'user',
          content: 'Return {"compatible":true,"summary":"Sortie structurée disponible."}.',
        },
      ],
      schema: STRUCTURED_OUTPUT,
    });
    failedProbe(result, reserves, 'STRUCTURED_UNRELIABLE');
  }

  if (required.includes('tools')) {
    const result = await input.session.step({
      system: [
        {
          text: 'Compatibility probe: call the strict tool exactly once with value "ok".',
          cache: false,
        },
      ],
      messages: [{ role: 'user', content: 'Call compatibility_probe with {"value":"ok"}.' }],
      tools: {
        compatibility_probe: {
          description: 'Strict compatibility probe. It must be called exactly once.',
          inputSchema: TOOL_INPUT,
        },
      },
    });
    if (!result.ok) {
      reserve('NO_TOOLS', reserves);
    } else {
      const call = result.value.toolCalls.find(
        (candidate) => candidate.toolName === 'compatibility_probe',
      );
      if (call === undefined || !TOOL_INPUT.safeParse(call.input).success) {
        reserve('NO_TOOLS', reserves);
      }
    }
  }

  if (required.includes('vision')) {
    const result = await input.session.object({
      system: [
        {
          text: 'Compatibility probe: inspect the provided image and return only the exact schema.',
          cache: false,
        },
      ],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Confirm that one opaque image was supplied.' },
            { type: 'image', image: TRANSPARENT_PIXEL, mediaType: 'image/png' },
          ],
        },
      ],
      schema: VISION_OUTPUT,
    });
    failedProbe(result, reserves, 'NO_VISION');
  }

  const reserveCodes = RESERVE_ORDER.filter((code) => reserves.has(code));
  const finishedAt = input.clock.now();
  return {
    credentialId: input.credentialId,
    modelId: input.modelId,
    task: input.task,
    status: reserveCodes.length === 0 ? 'compatible' : 'reserve',
    checkedAt: finishedAt.toISOString(),
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    requiredCapabilities: [...required],
    reserveCodes,
    reasons: reserveCodes.map((code) => ({
      code,
      message: AI_COMPATIBILITY_RESERVE_MESSAGES[code],
    })),
  };
}

/**
 * Projects one compatibility result onto the historical capability map. It is deliberately
 * conservative and is used only by legacy readers which still consume that additive field.
 */
export function compatibilityCapabilities(
  compatibility: AiTaskCompatibility,
): QualificationCapabilities {
  return {
    tools: !compatibility.reserveCodes.includes('NO_TOOLS'),
    structured: !compatibility.reserveCodes.includes('STRUCTURED_UNRELIABLE'),
    web_search: compatibility.requiredCapabilities.includes('web_search')
      ? !compatibility.reserveCodes.includes('NO_TOOLS')
      : false,
    passage_refs:
      compatibility.requiredCapabilities.includes('passage_refs') &&
      !compatibility.reserveCodes.includes('STRUCTURED_UNRELIABLE'),
    vision: !compatibility.reserveCodes.includes('NO_VISION'),
  };
}
