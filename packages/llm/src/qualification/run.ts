// Qualification battery of a personal model (SPEC-506 EF-1 to EF-3, ET-1 to ET-5).
// Four observable stages: connection, strict tool call, structured output, then one valid brick of
// each of the thirteen types. The caller supplies the brick adapter because `llm` may not import
// `bricks` (overview §3); validation therefore always runs through `@learny/bricks`.
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import type {
  QualificationBrickResult,
  QualificationCapabilities,
  QualificationIssue,
  QualificationReport,
  QualificationStepKey,
  QualificationStepResult,
} from '@learny/contracts';
import { AppError, err, isAppError, ok, type Clock, type Result } from '@learny/core';
import { aiCredentials } from '@learny/db';

import { llmMode } from '../config';
import type { RegisteredFixture } from '../mock/fixture-registry';
import { providerSupports } from '../providers/catalog';
import type { ResolvedModel } from '../resolve';
import { createSession, type LlmContext, type LlmSession } from '../session';

import {
  QUALIFICATION_FIXTURES,
  QUALIFICATION_SCENARIOS,
  type QualificationScenario,
} from './fixtures';

const PROMPT_ID = 'qualification.run';
const TASK = 'light' as const;
const QUALIFICATION_STEP_KEYS = ['connection', 'tools', 'structured', 'bricks'] as const;

/** Adapter implemented by `@learny/services` with the thirteen schemas of `@learny/bricks`. */
export interface QualificationBrickBattery {
  readonly types: readonly string[];
  schemaFor(type: string): z.ZodType;
  promptFor(type: string): string;
  validate(type: string, payload: unknown): Promise<Result<unknown, readonly QualificationIssue[]>>;
}

export type QualificationSession = Pick<LlmSession, 'step' | 'object'>;

export interface EvaluateQualificationInput {
  id: string;
  credentialId: string;
  modelId: string;
  provider: QualificationReport['provider'];
  battery: QualificationBrickBattery;
  clock: Clock;
  session: QualificationSession;
  mode: 'live' | 'mock';
}

export interface RunQualificationInput {
  /** Stable execution identifier: a retry is recorded under the same qualification history. */
  id: string;
  credentialId: string;
  modelId: string;
  battery: QualificationBrickBattery;
  clock: Clock;
  /** Explicit simulated scenario (tests and demonstration); live mode ignores it. */
  mockScenario?: QualificationScenario;
  mode?: 'live' | 'mock';
  /** Test seam for a restricted fixture set. */
  fixtures?: readonly RegisteredFixture[];
}

const TOOL_INPUT = z.object({ value: z.string().min(1).max(40) }).strict();
const STRUCTURED_OUTPUT = z
  .object({ ok: z.literal(true), summary: z.string().min(1).max(200) })
  .strict();

function validationError(detail: string): AppError {
  return new AppError('VALIDATION_FAILED', detail, { status: 422 });
}

function notFound(): AppError {
  return new AppError('CREDENTIAL_NOT_FOUND', 'Cette clé personnelle est introuvable.', {
    status: 404,
  });
}

function safeCode(error: unknown): string {
  if (isAppError(error)) return error.code;
  return 'AI_PROVIDER_ERROR';
}

function issuesOf(error: unknown): QualificationIssue[] {
  if (!isAppError(error)) return [];
  const code = error.code;
  const issues = (error.errors ?? []).slice(0, 20).map((issue) => ({
    code: issue.code ?? code,
    path: issue.path.slice(0, 300),
    message: issue.message.slice(0, 300),
  }));
  if (issues.length > 0) return issues;
  return [{ code, path: '', message: error.detail.slice(0, 300) }];
}

function failedStep(
  step: QualificationStepKey,
  errorCode: string,
  durationMs: number,
  modelVersion: string,
): QualificationStepResult {
  return { step, status: 'failed', durationMs, errorCode, modelVersion };
}

function passedStep(
  step: QualificationStepKey,
  durationMs: number,
  modelVersion: string,
): QualificationStepResult {
  return { step, status: 'passed', durationMs, errorCode: null, modelVersion };
}

function notRunBrick(type: string): QualificationBrickResult {
  return { type, status: 'failed', durationMs: 0, errorCode: 'NOT_RUN', issues: [] };
}

/**
 * Pure battery execution on an already-built session. Unit tests drive it with a simulated session
 * and a fake battery; the service uses the real `@learny/bricks` adapter.
 */
export async function evaluateQualification(
  input: EvaluateQualificationInput,
): Promise<QualificationReport> {
  const startedAt = input.clock.now();
  const steps = new Map<QualificationStepKey, QualificationStepResult>();
  const bricks = new Map<string, QualificationBrickResult>();
  for (const type of input.battery.types) bricks.set(type, notRunBrick(type));
  let modelVersion = input.modelId;
  let abort = false;
  let abortCode = 'NOT_RUN';

  const stepStart = input.clock.now();
  const connection = await input.session.step({
    system: [{ text: 'Qualification: answer with one short sentence.', cache: false }],
    messages: [{ role: 'user', content: 'Confirm that you are reachable.' }],
  });
  const connectionMs = Math.max(0, input.clock.now().getTime() - stepStart.getTime());
  if (!connection.ok) {
    abort = true;
    abortCode = safeCode(connection.error);
    steps.set('connection', failedStep('connection', abortCode, connectionMs, modelVersion));
  } else {
    modelVersion =
      input.mode === 'mock' ? input.modelId : connection.value.modelId || input.modelId;
    if (connection.value.text.trim() === '') {
      abort = true;
      abortCode = 'INVALID_OUTPUT';
      steps.set('connection', failedStep('connection', abortCode, connectionMs, modelVersion));
    } else {
      steps.set('connection', passedStep('connection', connectionMs, modelVersion));
    }
  }

  if (!abort) {
    const toolStart = input.clock.now();
    const tool = await input.session.step({
      system: [{ text: 'Qualification: call the provided probe tool exactly once.', cache: false }],
      messages: [{ role: 'user', content: 'Echo the value "ok" with the probe tool.' }],
      tools: {
        qualification_probe: {
          description: 'Echoes one short value; used only to verify a strict tool call.',
          inputSchema: TOOL_INPUT,
        },
      },
    });
    const toolMs = Math.max(0, input.clock.now().getTime() - toolStart.getTime());
    let toolError: string | null = null;
    if (!tool.ok) {
      toolError = safeCode(tool.error);
    } else {
      modelVersion = input.mode === 'mock' ? input.modelId : tool.value.modelId || modelVersion;
      const call = tool.value.toolCalls.find((entry) => entry.toolName === 'qualification_probe');
      const parsed = call === undefined ? null : TOOL_INPUT.safeParse(call.input);
      if (call === undefined || parsed === null || !parsed.success) {
        toolError = 'INVALID_OUTPUT';
      }
    }
    if (toolError === null) {
      steps.set('tools', passedStep('tools', toolMs, modelVersion));
    } else {
      abort = true;
      abortCode = toolError;
      steps.set('tools', failedStep('tools', toolError, toolMs, modelVersion));
    }
  }

  if (!abort) {
    const structuredStart = input.clock.now();
    const structured = await input.session.object({
      system: [{ text: 'Qualification: return the requested structured object.', cache: false }],
      messages: [{ role: 'user', content: 'Return {"ok": true, "summary": "..."}.' }],
      schema: STRUCTURED_OUTPUT,
    });
    const structuredMs = Math.max(0, input.clock.now().getTime() - structuredStart.getTime());
    if (structured.ok) {
      steps.set('structured', passedStep('structured', structuredMs, modelVersion));
    } else {
      abort = true;
      abortCode = safeCode(structured.error);
      steps.set('structured', failedStep('structured', abortCode, structuredMs, modelVersion));
    }
  }

  if (!abort) {
    for (const type of input.battery.types) {
      const brickStart = input.clock.now();
      const generated = await input.session.object({
        system: [
          {
            text: `Qualification: produce one valid "${type}" brick payload. Follow the schema exactly.`,
            cache: false,
          },
        ],
        messages: [{ role: 'user', content: input.battery.promptFor(type) }],
        schema: input.battery.schemaFor(type),
      });
      const durationMs = Math.max(0, input.clock.now().getTime() - brickStart.getTime());
      if (!generated.ok) {
        bricks.set(type, {
          type,
          status: 'failed',
          durationMs,
          errorCode: safeCode(generated.error),
          issues: issuesOf(generated.error),
        });
        continue;
      }
      const validated = await input.battery.validate(type, generated.value);
      if (validated.ok) {
        bricks.set(type, { type, status: 'passed', durationMs, errorCode: null, issues: [] });
      } else {
        bricks.set(type, {
          type,
          status: 'failed',
          durationMs,
          errorCode: 'INVALID_OUTPUT',
          issues: validated.error.slice(0, 20),
        });
      }
    }
  }

  const brickResults = input.battery.types.map((type) => bricks.get(type) ?? notRunBrick(type));
  const bricksPassed = brickResults.every((brick) => brick.status === 'passed');
  if (!abort) {
    const bricksMs = brickResults.reduce((sum, brick) => sum + brick.durationMs, 0);
    steps.set(
      'bricks',
      bricksPassed
        ? passedStep('bricks', bricksMs, modelVersion)
        : failedStep('bricks', 'INVALID_OUTPUT', bricksMs, modelVersion),
    );
  }

  const stepResults: QualificationStepResult[] = QUALIFICATION_STEP_KEYS.map((step) => {
    const found = steps.get(step);
    if (found !== undefined) return found;
    return failedStep(step, abort ? abortCode : 'NOT_RUN', 0, modelVersion);
  });
  const passed = (step: QualificationStepKey): boolean =>
    stepResults.find((entry) => entry.step === step)?.status === 'passed';
  const connectionPassed = passed('connection');
  const toolsPassed = passed('tools');
  const structuredPassed = passed('structured');
  const status =
    connectionPassed && toolsPassed && structuredPassed && bricksPassed ? 'qualified' : 'failed';
  const capabilities: QualificationCapabilities = {
    tools: toolsPassed,
    structured: structuredPassed,
    web_search: toolsPassed,
    passage_refs: bricksPassed,
    vision: providerSupports(input.provider, 'vision'),
  };
  const finishedAt = input.clock.now();
  return {
    id: input.id,
    credentialId: input.credentialId,
    modelId: input.modelId,
    provider: input.provider,
    status,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    modelVersion,
    steps: stepResults,
    bricks: brickResults,
    capabilities,
  };
}

interface CredentialInfo {
  provider: QualificationReport['provider'];
  baseUrl: string | null;
  modelIds: string[];
  outsideEu: boolean;
}

/** Reads one owned key under the explicit user scope; the encrypted payload never leaves the row. */
async function loadCredential(
  ctx: LlmContext,
  credentialId: string,
): Promise<Result<CredentialInfo>> {
  const rows = await ctx.db
    .select({
      provider: aiCredentials.provider,
      baseUrl: aiCredentials.baseUrl,
      modelIds: aiCredentials.modelIds,
      outsideEu: aiCredentials.outsideEu,
    })
    .from(aiCredentials)
    .where(and(eq(aiCredentials.id, credentialId), eq(aiCredentials.userId, ctx.userId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return err(notFound());
  return ok(row);
}

function scenarioOf(input: RunQualificationInput): QualificationScenario {
  const candidate = input.mockScenario ?? 'qualification-success';
  if (!(QUALIFICATION_SCENARIOS as readonly string[]).includes(candidate)) {
    return 'qualification-success';
  }
  return candidate;
}

/**
 * Runs the four-stage battery against one owned key. A failed step is a normal outcome and is
 * reported; only a missing/foreign credential or a non-configured model is an error.
 */
export async function runQualification(
  ctx: LlmContext,
  input: RunQualificationInput,
): Promise<Result<QualificationReport>> {
  const loaded = await loadCredential(ctx, input.credentialId);
  if (!loaded.ok) return loaded;
  const credential = loaded.value;
  if (!credential.modelIds.includes(input.modelId)) {
    return err(
      validationError('Ce modèle ne fait pas partie des modèles enregistrés pour cette clé.'),
    );
  }

  const resolved: ResolvedModel = {
    kind: 'byok',
    provider: credential.provider,
    modelId: input.modelId,
    credentialId: input.credentialId,
    baseUrl: credential.baseUrl,
    outsideEu: credential.outsideEu,
    task: TASK,
  };
  const mode = input.mode ?? llmMode();
  const session = await createSession(ctx, {
    task: TASK,
    promptId: PROMPT_ID,
    resolvedOverride: resolved,
    mode,
    mock: { scenario: scenarioOf(input) },
    fixtures: input.fixtures ?? QUALIFICATION_FIXTURES,
  });
  if (!session.ok) return err(session.error);

  const report = await evaluateQualification({
    id: input.id,
    credentialId: input.credentialId,
    modelId: input.modelId,
    provider: credential.provider,
    battery: input.battery,
    clock: input.clock,
    session: session.value,
    mode,
  });

  // CL-1 — a key deleted during the battery stops with CREDENTIAL_NOT_FOUND and no active model.
  const decryptFailure =
    report.steps.some((step) => step.errorCode === 'CREDENTIAL_DECRYPT_FAILED') ||
    report.bricks.some((brick) => brick.errorCode === 'CREDENTIAL_DECRYPT_FAILED');
  if (decryptFailure) {
    const stillThere = await loadCredential(ctx, input.credentialId);
    if (!stillThere.ok) return err(notFound());
  }
  return ok(report);
}
