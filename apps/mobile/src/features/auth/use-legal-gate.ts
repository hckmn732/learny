// Legal gate of the authenticated actions (SPEC-3101 EF-7, CL-6; BR-ACC-02).
//
// A guarded mutation answered `422 LEGAL_ACCEPTANCE_REQUIRED` opens the acceptance sheet with the
// versions of the refusal; once the acceptance is recorded, the refused action is replayed once
// (CL-6). The gate is deliberately independent of the screens so that the later mutating
// specifications reuse it without touching this screen.
import { useCallback, useRef, useState } from 'react';

import { expectedLegalVersions, type LegalVersions } from '../../auth/legal';

export interface LegalGate {
  /** Versions waiting for the acceptance, `null` when the sheet is closed. */
  readonly versions: LegalVersions | null;
  /** Opens the sheet when `error` requests a new acceptance; `true` when it was the case. */
  readonly handle: (error: unknown, replay?: () => void) => boolean;
  /** Closing without accepting: the refused action is not replayed. */
  readonly dismiss: () => void;
  /** Acceptance recorded: closes the sheet and replays the refused action. */
  readonly accepted: () => void;
}

/** Gate shared by the screens that perform a guarded mutation (EF-7). */
export function useLegalGate(): LegalGate {
  const [versions, setVersions] = useState<LegalVersions | null>(null);
  const replay = useRef<(() => void) | null>(null);

  const handle = useCallback((error: unknown, next?: () => void): boolean => {
    const expected = expectedLegalVersions(error);
    if (expected === null) return false;
    replay.current = next ?? null;
    setVersions(expected);
    return true;
  }, []);

  const dismiss = useCallback((): void => {
    replay.current = null;
    setVersions(null);
  }, []);

  const accepted = useCallback((): void => {
    const next = replay.current;
    replay.current = null;
    setVersions(null);
    next?.();
  }, []);

  return { versions, handle, dismiss, accepted };
}
