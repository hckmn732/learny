'use client';

import { TriangleAlert } from 'lucide-react';
import { useRef, useState } from 'react';

import { cn } from '../../cn';
import { Button } from '../Button';
import { toast } from '../Toast';

export type ErrorStateProps = {
  title?: string;
  description?: string;
  onRetry?: () => void;
  /** Support reference, copied with a ghost button (EF-14). */
  requestId?: string;
  className?: string;
  'data-testid'?: string;
};

const COPY_ERROR = 'Copie impossible : sélectionnez la référence manuellement.';

/** Error state with retry and copyable reference (SPEC-303, EF-14, CL-9). */
export const ErrorState = ({
  title = 'Impossible de charger ces données',
  description = 'Vérifiez votre connexion puis réessayez.',
  onRetry,
  requestId,
  className,
  ...props
}: ErrorStateProps) => {
  const codeRef = useRef<HTMLElement>(null);
  const [copyError, setCopyError] = useState(false);

  const copy = async () => {
    if (!requestId) return;
    try {
      await navigator.clipboard.writeText(requestId);
      setCopyError(false);
      toast({ title: 'Référence copiée', tone: 'success' });
    } catch {
      setCopyError(true);
      const node = codeRef.current;
      const selection = window.getSelection();
      if (node && selection) {
        const range = document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  };

  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-12 p-32 text-center', className)}
      {...props}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-64 items-center justify-center rounded-20 bg-orange-soft text-orange-ink"
      >
        <TriangleAlert aria-hidden="true" size={28} strokeWidth={1.8} />
      </span>
      <h2 className="m-0 text-22 font-600 font-display tracking-heading">{title}</h2>
      <p className="m-0 max-w-[480px] text-15 leading-1.55 text-ink-muted">{description}</p>
      {requestId ? (
        <p className="m-0 flex flex-wrap items-center justify-center gap-6 text-12 text-ink-muted">
          <span>Référence :</span>
          <code className="font-mono" ref={codeRef}>
            {requestId}
          </code>
          <Button size="sm" variant="ghost" onClick={() => void copy()}>
            Copier
          </Button>
        </p>
      ) : null}
      {copyError ? (
        <p className="m-0 text-13 text-danger" role="alert">
          {COPY_ERROR}
        </p>
      ) : null}
      {onRetry ? (
        <Button className="mt-4" variant="outline" onClick={onRetry}>
          Réessayer
        </Button>
      ) : null}
    </div>
  );
};
