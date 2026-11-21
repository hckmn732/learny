import { z } from 'zod';

import type { AiTask } from '@learny/config';
import {
  type AiCompatibilityReserveCode,
  type AiTaskCompatibility,
  type QualificationCapabilities,
} from '@learny/contracts';
import type { Clock, Result } from '@learny/core';
import { settings } from '@learny/i18n/fr/settings';

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
  'CHECK_TIMEOUT',
];
export const COMPATIBILITY_TIMEOUT_MS = 12_000;

// Valid 16×16 RGB PNG (CRC checked); the former 1×1 pixel was corrupted and rejected by providers.
const TRANSPARENT_PIXEL = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGO4IydHEmIY1TCqYfhqAACaMxgQdGu1YAAAAABJRU5ErkJggg==',
    'base64',
  ),
);

export type CompatibilitySession = Pick<LlmSession, 'step' | 'object'>;

export interface EvaluateTaskCompatibilityInput {
  credentialId: string;
  modelId: string;
  task: AiTask;
  clock: Clock;
  session: CompatibilitySession;
  timeoutMs?: number;
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
  if (!result.ok) reserve(result.error.code === 'AI_TIMEOUT' ? 'CHECK_TIMEOUT' : code, reserves);
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
  const controller = new AbortController();
  const probes: Promise<void>[] = [];
  const deadline = new Promise<void>((resolve) => {
    controller.signal.addEventListener(
      'abort',
      () => {
        resolve();
      },
      { once: true },
    );
  });
  const timeout = setTimeout(() => {
    controller.abort();
  }, input.timeoutMs ?? COMPATIBILITY_TIMEOUT_MS);

  if (required.includes('structured')) {
    probes.push(
      input.session
        .object({
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
          abortSignal: controller.signal,
        })
        .then((result) => {
          failedProbe(result, reserves, 'STRUCTURED_UNRELIABLE');
        }),
    );
  }

  if (required.includes('tools')) {
    probes.push(
      input.session
        .step({
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
          abortSignal: controller.signal,
        })
        .then((result) => {
          if (!result.ok) {
            reserve(result.error.code === 'AI_TIMEOUT' ? 'CHECK_TIMEOUT' : 'NO_TOOLS', reserves);
          } else {
            const call = result.value.toolCalls.find(
              (candidate) => candidate.toolName === 'compatibility_probe',
            );
            if (call === undefined || !TOOL_INPUT.safeParse(call.input).success) {
              reserve('NO_TOOLS', reserves);
            }
          }
        }),
    );
  }

  if (required.includes('vision')) {
    probes.push(
      input.session
        .object({
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
          abortSignal: controller.signal,
        })
        .then((result) => {
          failedProbe(result, reserves, 'NO_VISION');
        }),
    );
  }

  const all = Promise.all(probes).then(() => 'completed' as const);
  const outcome = await Promise.race([all, deadline.then(() => 'timeout' as const)]);
  clearTimeout(timeout);
  if (outcome === 'timeout') reserves.add('CHECK_TIMEOUT');
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
      message: settings.aiModels.compatibilityReserveMessages[code],
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
  const timedOut = compatibility.reserveCodes.includes('CHECK_TIMEOUT');
  return {
    tools: !timedOut && !compatibility.reserveCodes.includes('NO_TOOLS'),
    structured: !timedOut && !compatibility.reserveCodes.includes('STRUCTURED_UNRELIABLE'),
    web_search: compatibility.requiredCapabilities.includes('web_search')
      ? !timedOut && !compatibility.reserveCodes.includes('NO_TOOLS')
      : false,
    passage_refs:
      compatibility.requiredCapabilities.includes('passage_refs') &&
      !timedOut &&
      !compatibility.reserveCodes.includes('STRUCTURED_UNRELIABLE'),
    vision: !timedOut && !compatibility.reserveCodes.includes('NO_VISION'),
  };
}
