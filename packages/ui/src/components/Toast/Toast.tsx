'use client';

import * as ToastPrimitive from '@radix-ui/react-toast';
import { X } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { cn } from '../../cn';

import { dismissToast, useToasts, type ToastRecord } from './store';

const DOT_CLASS = {
  neutral: 'bg-on-dark-muted',
  success: 'bg-lime',
  error: 'bg-orange',
} as const;

const ToastItem = ({ record }: Readonly<{ record: ToastRecord }>) => {
  const [open, setOpen] = useState(true);
  return (
    <ToastPrimitive.Root
      open={open}
      duration={record.duration}
      // Foreground is assertive in Radix; success and neutral stay polite (ADR-0270).
      type={record.tone === 'error' ? 'foreground' : 'background'}
      data-testid={`ui-toast-${record.tone}`}
      className={cn(
        'flex w-full items-start gap-10 rounded-14 bg-ink px-16 py-12 text-white shadow-toast animate-toast-in motion-reduce:animate-none',
        'data-[state=closed]:animate-none data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]',
      )}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) dismissToast(record.id);
      }}
    >
      <span
        aria-hidden="true"
        className={cn('mt-6 size-8 shrink-0 rounded-full', DOT_CLASS[record.tone])}
      />
      <div className="min-w-0 flex-1">
        <ToastPrimitive.Title className="text-14 font-600">{record.title}</ToastPrimitive.Title>
        {record.description ? (
          <ToastPrimitive.Description className="mt-2 text-13 leading-1.45 text-on-dark-secondary">
            {record.description}
          </ToastPrimitive.Description>
        ) : null}
        {record.action ? (
          <ToastPrimitive.Action altText={record.action.label} asChild>
            <button
              type="button"
              className="mt-6 cursor-pointer border-0 bg-transparent p-0 text-13 font-600 text-lime hover:underline"
              onClick={record.action.onClick}
            >
              {record.action.label}
            </button>
          </ToastPrimitive.Action>
        ) : null}
      </div>
      <ToastPrimitive.Close asChild>
        <button
          type="button"
          aria-label="Fermer"
          className="mt-1 inline-flex size-24 shrink-0 cursor-pointer items-center justify-center rounded-6 border-0 bg-transparent p-0 text-on-dark-muted hover:text-white"
        >
          <X aria-hidden="true" size={16} strokeWidth={2} />
        </button>
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
};

/** Mounts the single toast region of the application (EF-10). */
export const ToastProvider = ({ children }: Readonly<{ children: ReactNode }>) => {
  const records = useToasts();
  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {children}
      {records.map((record) => (
        <ToastItem key={record.id} record={record} />
      ))}
      <ToastPrimitive.Viewport
        label="Notifications"
        className="fixed bottom-24 left-1/2 z-toast m-0 flex w-[calc(100vw-32px)] max-w-[420px] -translate-x-1/2 list-none flex-col gap-8 p-0 outline-none"
      />
    </ToastPrimitive.Provider>
  );
};
