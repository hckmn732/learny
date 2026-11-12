// Module interleaving of the daily global quiz (SPEC-406 ET-2, EF-1). The caller splits the
// initial priority order into the gap block and the ordinary due block, then interleaves each
// block separately: a gap is never pushed behind an ordinary notion, and two notions of the same
// module are never adjacent while another module remains available.
import type { Id } from '../types';

export interface ModuleTagged {
  moduleId: Id;
}

/**
 * Greedy interleaving: at each rank, take the first remaining item whose module differs from the
 * previous one; when only the previous module remains, keep its natural order (CL-2).
 */
export function interleaveByModule<T extends ModuleTagged>(items: readonly T[]): T[] {
  const remaining = [...items];
  const result: T[] = [];
  let previousModule: Id | null = null;

  while (remaining.length > 0) {
    const different = remaining.findIndex((item) => item.moduleId !== previousModule);
    const index = different === -1 ? 0 : different;
    const [item] = remaining.splice(index, 1);
    if (item === undefined) break;
    result.push(item);
    previousModule = item.moduleId;
  }

  return result;
}
