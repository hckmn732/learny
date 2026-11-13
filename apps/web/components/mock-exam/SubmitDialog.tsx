'use client';

import { useEffect, useRef } from 'react';

import { fr } from '../../messages/fr';

const t = fr.mockExam;

export interface SubmitDialogProps {
  open: boolean;
  unanswered: number;
  marked: number;
  remainingMinutes: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** BR-PRA-03, EF-3 — one confirmation before finishing, with unanswered and marked counts. */
export function SubmitDialog({
  open,
  unanswered,
  marked,
  remainingMinutes,
  busy,
  onCancel,
  onConfirm,
}: SubmitDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div
      aria-describedby="d-exam-confirm"
      aria-labelledby="t-exam-confirm"
      className="fixed inset-0 z-60 flex items-center justify-center bg-overlay p-16"
      data-testid="exam-confirm-dialog"
      role="alertdialog"
    >
      <div className="flex w-full max-w-[440px] flex-col gap-14 rounded-24 bg-surface p-26">
        <h2 className="m-0 font-display text-22 font-600" id="t-exam-confirm">
          {t.confirmTitle}
        </h2>
        <p className="m-0 text-15 leading-1.5 text-ink-secondary" id="d-exam-confirm">
          {t.confirmText(unanswered, marked, remainingMinutes)}
        </p>
        <div className="flex flex-wrap justify-end gap-8">
          <button
            className="min-h-44 rounded-12 border border-border-strong bg-surface px-16 text-14 font-600 text-ink"
            onClick={onCancel}
            ref={cancelRef}
            type="button"
          >
            {t.cancelFinish}
          </button>
          <button
            className="min-h-44 rounded-12 bg-ink px-16 text-14 font-700 text-white disabled:opacity-60"
            data-testid="exam-confirm-finish"
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? t.saving : t.confirmFinish}
          </button>
        </div>
      </div>
    </div>
  );
}
