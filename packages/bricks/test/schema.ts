import { expect } from 'vitest';

import type { BrickType } from '../src/brick-types';
import { parseBrickPayload } from '../src/validate';

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function payload<T>(value: T): T {
  return clone(value);
}

export function repeat(length: number, character = 'x'): string {
  return character.repeat(length);
}

export function expectSchemaAccepts(type: BrickType, value: unknown): void {
  const result = parseBrickPayload(type, value);
  expect(result.ok, `${type} devrait être valide : ${JSON.stringify(result)}`).toBe(true);
}

export function expectSchemaRejects(type: BrickType, value: unknown): void {
  const result = parseBrickPayload(type, value);
  expect(result.ok, `${type} devrait être invalide`).toBe(false);
}
