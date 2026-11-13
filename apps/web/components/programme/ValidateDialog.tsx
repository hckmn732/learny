'use client';

import type { ProgrammeProposalDto } from '@learny/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.programme;

export interface ValidateDialogProps {
  proposal: ProgrammeProposalDto;
  open: boolean;
  loading: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function ValidateDialog({
  proposal,
  open,
  loading,
  error,
  onOpenChange,
  onConfirm,
}: ValidateDialogProps) {
  const chapters = proposal.modules.reduce((count, module) => count + module.chapters.length, 0);
  const limitReached = proposal.activeFormationCount >= 3;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent data-testid="programme-validate-dialog">
        <DialogTitle>{t.validateTitle}</DialogTitle>
        <DialogDescription>{t.validateDescription}</DialogDescription>
        <p className="m-0 mt-16 rounded-14 bg-surface-subtle px-16 py-12 text-14 font-600">
          {t.validateSummary(proposal.modules.length, chapters)}
        </p>
        {limitReached ? (
          <div
            className="mt-16 rounded-16 border border-orange-ink/40 bg-orange-soft px-16 py-14 text-14 text-orange-ink-strong"
            data-testid="programme-limit-alert"
            role="alert"
          >
            <p className="m-0 font-700">{t.limitTitle}</p>
            <p className="m-0 mt-6">{t.limitBody}</p>
            <a className="mt-8 inline-block font-700" href="/parametres#formations">
              {t.limitAction}
            </a>
          </div>
        ) : null}
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
            {t.validateCancel}
          </Button>
          <Button
            data-testid="programme-validate-confirm"
            disabled={limitReached}
            loading={loading}
            onClick={onConfirm}
            type="button"
            variant="dark"
          >
            {loading ? t.validating : t.validateConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
