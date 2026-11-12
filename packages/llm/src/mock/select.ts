// ADR-0153 §2 — deterministic fixture selection.
// Order: explicit scenario, `[[mock:<scenario>]]` marker, first matching fixture by path,
// `<promptId>.default.json`, then MOCK_FIXTURE_NOT_FOUND. Selection never touches the network.
import type { ModelMessage } from 'ai';

import type { AiTask } from '@learny/config';
import { AppError, err, ok, type Result } from '@learny/core';

import { fixturesForTask, type RegisteredFixture } from './fixture-registry';
import type { FixtureFile } from './fixture-schema';

export const MOCK_MARKER_PATTERN = /\[\[mock:([a-z0-9]+(?:-[a-z0-9]+)*)\]\]/g;

export interface SelectFixtureInput {
  task: AiTask;
  promptId: string;
  messages: ModelMessage[];
  explicitScenario?: string | undefined;
}

export interface SelectFixtureOptions {
  /** Test seam: restrict the candidate set without touching the committed registry. */
  fixtures?: readonly RegisteredFixture[];
}

/** Recursively sorts object keys so two equivalent inputs always serialise identically. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortValue((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

function textsOf(message: ModelMessage): string[] {
  const content = message.content;
  if (typeof content === 'string') return [content];
  if (!Array.isArray(content)) return [];
  const texts: string[] = [];
  for (const part of content as readonly Record<string, unknown>[]) {
    if (part.type === 'text' && typeof part.text === 'string') texts.push(part.text);
  }
  return texts;
}

function mapTextParts(message: ModelMessage, replace: (text: string) => string): ModelMessage {
  const content = message.content;
  if (typeof content === 'string') return { ...message, content: replace(content) } as ModelMessage;
  if (!Array.isArray(content)) return message;
  return {
    ...message,
    content: (content as readonly Record<string, unknown>[]).map((part) =>
      part.type === 'text' && typeof part.text === 'string'
        ? { ...part, text: replace(part.text) }
        : part,
    ),
  } as ModelMessage;
}

/** Scenario declared by the first `[[mock:x]]` marker, in message order. */
export function markerScenario(messages: readonly ModelMessage[]): string | undefined {
  for (const message of messages) {
    for (const text of textsOf(message)) {
      MOCK_MARKER_PATTERN.lastIndex = 0;
      const match = MOCK_MARKER_PATTERN.exec(text);
      if (match?.[1] !== undefined) return match[1];
    }
  }
  return undefined;
}

/** Removes every marker from the prompt before it reaches a model, mock or live (ET-6). */
export function stripMockMarkers(messages: readonly ModelMessage[]): ModelMessage[] {
  MOCK_MARKER_PATTERN.lastIndex = 0;
  return messages.map((message) => mapTextParts(message, (text) => text.replace(MOCK_MARKER_PATTERN, '')));
}

function notFound(input: SelectFixtureInput, tried: string[]): AppError {
  return new AppError(
    'MOCK_FIXTURE_NOT_FOUND',
    `Aucune fixture pour la tâche « ${input.task} » et la consigne « ${input.promptId} » (candidats : ${tried.join(', ')}).`,
  );
}

export function selectFixture(
  input: SelectFixtureInput,
  options: SelectFixtureOptions = {},
): Result<FixtureFile, AppError> {
  const candidates = (options.fixtures ?? fixturesForTask(input.task)).filter(
    (candidate) => candidate.fixture.task === input.task,
  );
  const tried: string[] = [];
  const serialised = canonicalJson(input.messages);
  const scenario = input.explicitScenario ?? markerScenario(input.messages);

  if (scenario !== undefined) {
    const exact = candidates.find((candidate) => candidate.fixture.scenario === scenario);
    if (exact !== undefined) return ok(exact.fixture);
    tried.push(`scénario « ${scenario} »`);
  }

  // (c) first fixture of the task folder whose promptId and contains all match strings.
  for (const candidate of candidates) {
    const { fixture } = candidate;
    if (fixture.promptId !== input.promptId) continue;
    if (fixture.match === undefined) continue;
    if (fixture.match.contains.every((needle) => serialised.includes(needle))) {
      return ok(fixture);
    }
  }

  // (d) conventional default file for the prompt, with or without its task prefix.
  const basename = input.promptId.split('.').at(-1) ?? input.promptId;
  const defaults = [`${input.promptId}.default.json`, `${basename}.default.json`];
  for (const name of defaults) {
    tried.push(`${input.task}/${name}`);
    const candidate = candidates.find((entry) => entry.path === `${input.task}/${name}`);
    if (candidate !== undefined && candidate.fixture.promptId === input.promptId) {
      return ok(candidate.fixture);
    }
  }

  // A fixture without `match` is still a legitimate alphabetical candidate.
  for (const candidate of candidates) {
    tried.push(candidate.path);
    if (candidate.fixture.promptId === input.promptId) return ok(candidate.fixture);
  }
  return err(notFound(input, tried));
}

export type { FixtureFile };
