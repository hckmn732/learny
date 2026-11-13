'use client';

import { fr } from '../../messages/fr';

import type { Selection } from './use-text-selection';

const t = fr.tutorChat;

export function SelectionBar({
  selection,
  onAsk,
  onDismiss,
}: {
  selection: Selection;
  onAsk: () => void;
  onDismiss: () => void;
}): React.ReactElement {
  return (
    <div
      aria-label={t.selectionRegion}
      className="fixed bottom-24 left-1/2 z-drawer flex min-h-52 w-max max-w-[min(640px,calc(100%-32px))] -translate-x-1/2 items-center gap-12 rounded-16 bg-ink py-8 pr-8 pl-16 text-white shadow-toast"
      data-testid="tutor-selection-bar"
      role="region"
    >
      <span className="min-w-0 truncate text-13 text-on-dark-secondary">
        « {selection.preview} »
      </span>
      <button
        className="inline-flex min-h-40 flex-none cursor-pointer items-center rounded-11 bg-lime px-14 text-14 font-700 text-ink"
        data-testid="tutor-selection-ask"
        onClick={onAsk}
        type="button"
      >
        {t.selectionAsk}
      </button>
      <button
        aria-label={t.selectionDismiss}
        className="h-36 w-36 flex-none cursor-pointer rounded-10 bg-transparent text-20 leading-1 text-on-dark-muted"
        onClick={onDismiss}
        type="button"
      >
        ×
      </button>
    </div>
  );
}
