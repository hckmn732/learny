// Insertion point of the origin guard of mutations (SPEC-201 ET-3 step 3). SPEC-208 registers the
// real guard with `setOriginGuard`; it throws `AppError('ORIGIN_NOT_ALLOWED')` to refuse.
export interface OriginGuard {
  check(request: Request): void | Promise<void>;
}

export const noopOriginGuard: OriginGuard = { check: () => undefined };

let current: OriginGuard = noopOriginGuard;

export function getOriginGuard(): OriginGuard {
  return current;
}

export function setOriginGuard(guard: OriginGuard): void {
  current = guard;
}
