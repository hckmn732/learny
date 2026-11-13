'use client';

import { useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Textarea,
} from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.programme;

export interface AdjustDialogProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (message: string) => void;
}

export function AdjustDialog({ open, loading, error, onOpenChange, onSubmit }: AdjustDialogProps) {
  const [message, setMessage] = useState('');
  const trimmed = message.trim();

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent data-testid="programme-adjust-dialog" size="lg">
        <DialogTitle>{t.adjustTitle}</DialogTitle>
        <DialogDescription>{t.adjustDescription}</DialogDescription>
        <Textarea
          className="mt-20"
          data-testid="programme-adjust-message"
          disabled={loading}
          id="programme-adjust-message"
          label={t.adjustLabel}
          maxLength={2000}
          onChange={(event) => {
            setMessage(event.target.value);
          }}
          placeholder={t.adjustPlaceholder}
          rows={5}
          value={message}
        />
        {error === null ? null : (
          <p className="m-0 mt-12 text-13 font-600 text-orange-ink" role="alert">
            {error}
          </p>
        )}
        <DialogFooter className="mt-20">
          <Button
            onClick={() => {
              onOpenChange(false);
            }}
            type="button"
            variant="outline"
          >
            {t.adjustCancel}
          </Button>
          <Button
            data-testid="programme-adjust-submit"
            disabled={trimmed.length === 0}
            loading={loading}
            onClick={() => {
              onSubmit(trimmed);
            }}
            type="button"
            variant="dark"
          >
            {loading ? t.adjusting : t.adjustSubmit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
