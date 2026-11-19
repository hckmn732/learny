import { createHash } from 'node:crypto';

export function perfUuid(source: string): string {
  const hex = createHash('md5').update(source).digest('hex');
  const value = `${hex.slice(0, 12)}4${hex.slice(13, 16)}8${hex.slice(17)}`;
  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20, 32),
  ].join('-');
}

export function perfUserId(index: number): string {
  return perfUuid(`perf:user:${String(index)}`);
}

export function perfFormationId(index: number): string {
  return perfUuid(`perf:formation:${String(index)}`);
}
