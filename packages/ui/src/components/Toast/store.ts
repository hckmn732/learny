'use client';

import { useSyncExternalStore } from 'react';

export type ToastTone = 'neutral' | 'success' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  action?: ToastAction;
  /** Defaults to 5 000 ms, or 8 000 ms when an action is present (EF-10). */
  durationMs?: number;
}

export interface ToastRecord extends Omit<ToastOptions, 'tone' | 'durationMs'> {
  id: number;
  tone: ToastTone;
  /** Resolved Radix duration in milliseconds. */
  duration: number;
}

/** At most three simultaneous toasts; adding a fourth removes the oldest (EF-10, CL-8). */
const MAX_TOASTS = 3;
const DEFAULT_DURATION = 5000;
const ACTION_DURATION = 8000;

let records: ToastRecord[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const EMPTY: ToastRecord[] = [];

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Imperative toast of SPEC-303 EF-10; backed by a module store, no global state manager. */
export function toast(options: ToastOptions): number {
  const id = nextId;
  nextId += 1;
  const tone = options.tone ?? 'neutral';
  const duration = options.durationMs ?? (options.action ? ACTION_DURATION : DEFAULT_DURATION);
  const record: ToastRecord = {
    ...options,
    id,
    tone,
    duration,
  };
  records = [...records, record].slice(-MAX_TOASTS);
  emit();
  return id;
}

export function dismissToast(id: number): void {
  const next = records.filter((record) => record.id !== id);
  if (next.length === records.length) return;
  records = next;
  emit();
}

/** Clears the stack (tests and route transitions). */
export function clearToasts(): void {
  if (records.length === 0) return;
  records = [];
  emit();
}

export function getToasts(): ToastRecord[] {
  return records;
}

export function useToasts(): ToastRecord[] {
  return useSyncExternalStore(subscribe, getToasts, () => EMPTY);
}
