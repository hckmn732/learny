'use client';

import { ArrowRight } from 'lucide-react';
import type { RefObject } from 'react';

import { fr } from '../../messages/fr';

const t = fr.cadrage;

/** EF-7 — selections first, then the free text, joined exactly as the stored learner message. */
export function composeReplyContent(labels: readonly string[], text: string): string {
  const trimmed = text.trim();
  const selected = labels.join(', ');
  if (selected === '') return trimmed;
  return trimmed === '' ? selected : `${selected}. ${trimmed}`;
}

export interface ReplyBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  selectedCount?: number;
  disabled?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
}

export const ReplyBar = ({
  value,
  onChange,
  onSend,
  selectedCount = 0,
  disabled = false,
  inputRef,
}: ReplyBarProps) => {
  const canSend = !disabled && (value.trim() !== '' || selectedCount > 0);
  return (
    <div className="mt-auto flex gap-8 border-t border-divider px-20 py-16">
      <label className="sr-only" htmlFor="cadrage-reply">
        {t.replyLabel}
      </label>
      <input
        className="min-h-48 min-w-0 flex-1 rounded-14 border border-solid border-border-strong bg-surface px-16 text-15 text-ink placeholder:text-ink-muted disabled:cursor-not-allowed disabled:opacity-55"
        data-testid="cadrage-reply"
        disabled={disabled}
        id="cadrage-reply"
        maxLength={1000}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (canSend) onSend();
          }
        }}
        placeholder={t.replyPlaceholder}
        ref={inputRef}
        type="text"
        value={value}
      />
      <button
        aria-label={t.send}
        className="flex h-48 w-48 shrink-0 cursor-pointer items-center justify-center rounded-14 border-0 bg-ink text-white hover:bg-dark-700 disabled:cursor-not-allowed disabled:opacity-45"
        data-testid="cadrage-send"
        disabled={!canSend}
        onClick={onSend}
        type="button"
      >
        <ArrowRight aria-hidden="true" size={18} strokeWidth={2.2} />
      </button>
    </div>
  );
};
