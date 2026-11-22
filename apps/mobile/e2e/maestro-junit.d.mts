// Types of maestro-junit.mjs for TypeScript consumers (Vitest unit tests, ADR-3015 § 3).
export interface JunitCase {
  name: string;
  file: string | null;
  time: number;
  status: 'passed' | 'failed' | 'skipped';
  message: string | null;
}

export interface FlowHeader {
  name: string;
  file?: string;
}

export function decodeXmlText(value: string): string;
export function parseJunit(xml: string): JunitCase[];
export function testcaseNames(xml: string): string[];
export function missingFlows(xml: string, flows: FlowHeader[]): string[];
export function junitProblem(xml: string): string | null;
