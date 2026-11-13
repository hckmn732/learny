'use client';

import { Button } from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.exercises;

export interface HintButtonProps {
  hintsLeft: number;
  disabled?: boolean;
  loading?: boolean;
  onHint: () => void;
}

/**
 * Hint action of SCR-08 (EF-1, CL-3). The control is disabled when the two hints are used; the
 * server still refuses a third request with a 422, so a stale page cannot exceed the limit.
 */
export function HintButton({
  hintsLeft,
  disabled = false,
  loading = false,
  onHint,
}: HintButtonProps) {
  const empty = hintsLeft <= 0;
  return (
    <Button
      data-testid="exercise-hint"
      disabled={disabled || empty}
      loading={loading}
      onClick={onHint}
      size="lg"
      variant="outline"
    >
      {empty ? t.hintsEmpty : t.hint}
    </Button>
  );
}
