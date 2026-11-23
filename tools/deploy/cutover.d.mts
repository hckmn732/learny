// Types of the progressive cutover planner (tools/deploy/cutover.mjs) for TypeScript consumers.
export type Owner = 'ts' | 'py';

export interface Operation {
  id: string;
  method: string;
  context: string;
}

export interface OwnershipTable {
  operations: Record<string, Owner>;
  special: Record<string, Owner>;
}

export interface Tables {
  ownership: OwnershipTable;
  inventory: Operation[];
}

export interface PlanInput {
  stage: string;
  context?: string;
  all?: boolean;
  current?: Record<string, Owner> | string;
}

export interface Writers {
  owners: Owner[];
  writes: string[];
}

export const ROOT: string;
export const OWNERSHIP_FILE: string;
export const INVENTORY_FILE: string;
export const WILDCARD: string;
export const STAGES: string[];

export class CutoverError extends Error {
  code: string;
  constructor(code: string, message: string);
}

export function parseOwnership(text: string): OwnershipTable;
export function readInventory(text: string): Operation[];
export function isRead(operation: Operation): boolean;
export function readTables(root?: string): Tables;
export function normaliseOverrides(input: Record<string, Owner> | string): Record<string, Owner>;
export function ownerOf(
  entry: string,
  table: Record<string, Owner>,
  overrides: Record<string, Owner>,
): Owner;
export function expand(tables: Tables, overrides: Record<string, Owner>): Record<string, Owner>;
export function contextsOf(inventory: Operation[]): Map<string, { reads: string[]; writes: string[] }>;
export function writersOf(
  tables: Tables,
  overrides: Record<string, Owner>,
  context: string,
): Writers;
export function checkOverrides(tables: Tables, overrides: Record<string, Owner>): string[];
export function assertSingleWriter(
  tables: Tables,
  overrides: Record<string, Owner>,
  context: string,
): Owner;
export function compact(tables: Tables, overrides: Record<string, Owner>): Record<string, Owner>;
export function planCutover(tables: Tables, input: PlanInput): Record<string, Owner>;
export function formatOverrides(overrides: Record<string, Owner>): string;
