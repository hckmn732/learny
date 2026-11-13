'use client';

import { useEffect, useState } from 'react';

// SPEC-610 EF-4, ET-9, CL-1, CL-2 — selection of at least 12 normalised characters inside the
// course article. `pointerup` catches the mouse, `selectionchange` the keyboard (Maj + arrows),
// debounced by 150 ms. A selection in the panel, the toc or the selection bar is ignored.

export const SELECTION_MIN = 12;
export const SELECTION_PREVIEW = 90;
export const PASSAGE_MAX = 1_000;

export interface Selection {
  text: string;
  preview: string;
  passageText: string;
}

export function normalizeSelection(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function selectionPreview(text: string): string {
  return text.length > SELECTION_PREVIEW ? `${text.slice(0, SELECTION_PREVIEW - 2)}…` : text;
}

export function passageTextOf(text: string): string {
  return text.length > PASSAGE_MAX ? text.slice(0, PASSAGE_MAX) : text;
}

export function selectionFrom(raw: string): Selection | null {
  const text = normalizeSelection(raw);
  if (text.length < SELECTION_MIN) return null;
  return { text, preview: selectionPreview(text), passageText: passageTextOf(text) };
}

function insideArticle(node: Node | null): boolean {
  const element = node instanceof Element ? node : (node?.parentElement ?? null);
  if (element === null) return false;
  return element.closest('article[data-cours]') !== null;
}

function ignored(node: Node | null): boolean {
  const element = node instanceof Element ? node : (node?.parentElement ?? null);
  return (
    element?.closest('#chat-tuteur, [data-testid="tutor-selection-bar"]') !== null &&
    element !== null
  );
}

export function useTextSelection(enabled: boolean): {
  selection: Selection | null;
  dismiss: () => void;
} {
  const [selection, setSelection] = useState<Selection | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const read = (): void => {
      const current = window.getSelection();
      if (current === null || current.rangeCount === 0) return;
      const anchor = current.anchorNode;
      if (ignored(anchor) || !insideArticle(anchor)) return;
      const next = selectionFrom(current.toString());
      if (next !== null) setSelection(next);
    };
    const schedule = (): void => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(read, 150);
    };
    const onPointerUp = (event: PointerEvent): void => {
      const target = event.target instanceof Node ? event.target : null;
      if (target !== null && (ignored(target) || !insideArticle(target))) return;
      schedule();
    };
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('selectionchange', schedule);
    return () => {
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('selectionchange', schedule);
    };
  }, [enabled]);

  const dismiss = (): void => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  return { selection, dismiss };
}
