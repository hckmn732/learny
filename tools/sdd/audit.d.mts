// Types of audit.mjs for TypeScript consumers (tests).
export function auditRepository(root?: string): {
  errors: string[];
  warnings: string[];
  report: string;
};
