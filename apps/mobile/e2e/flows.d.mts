// Types of flows.mjs for TypeScript consumers (Vitest unit tests, ADR-3015 § 3).
export interface FlowHeader {
  name: string;
  tags: string[];
  appId: string;
  content: string;
}

export function parseFlowHeader(content: string): FlowHeader;
