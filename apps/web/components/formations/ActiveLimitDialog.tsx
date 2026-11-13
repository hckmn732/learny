'use client';

import { useState } from 'react';

import type { SidebarFormation } from '@learny/contracts';
import {
  Button,
  ChoiceCard,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.shell.sidebar.formationManagement;

export interface ActiveLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Formation the learner is trying to resume. */
  targetTitle: string;
  /** EF-3 — the three active formations offered as pause candidates. */
  formations: readonly SidebarFormation[];
  pending?: boolean;
  onConfirm: (pauseFormationId: string) => void;
}

/**
 * SPEC-618 EF-3 — a fourth active formation is never created silently: the learner explicitly
 * chooses which active formation to pause before the resume is applied.
 */
export const ActiveLimitDialog = ({
  open,
  onOpenChange,
  targetTitle,
  formations,
  pending = false,
  onConfirm,
}: ActiveLimitDialogProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const changeOpen = (open: boolean) => {
    if (!open) setSelectedId(null);
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        data-testid="active-limit-dialog"
        aria-labelledby="active-limit-title"
        aria-describedby="active-limit-description"
        hideClose
      >
        <DialogTitle id="active-limit-title">{t.limitTitle}</DialogTitle>
        <DialogDescription id="active-limit-description">
          {t.limitDescription(targetTitle)}
        </DialogDescription>
        <div
          role="radiogroup"
          aria-label={t.limitChoose}
          data-testid="active-limit-options"
          className="mt-20 flex flex-col gap-8"
        >
          {formations.map((formation) => (
            <ChoiceCard
              key={formation.id}
              value={formation.id}
              selected={formation.id === selectedId}
              disabled={pending}
              data-testid={`active-limit-option-${formation.id}`}
              label={formation.title}
              description={`Module ${String(
                formation.currentModulePosition ?? 0,
              )} sur ${String(formation.moduleCount)} · ${String(formation.progressPercent)} %`}
              onClick={() => {
                setSelectedId(formation.id);
              }}
            />
          ))}
        </div>
        {formations.length === 0 ? (
          <p className="mt-16 text-14 text-ink-muted">{t.limitEmpty}</p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              changeOpen(false);
            }}
            disabled={pending}
          >
            {t.cancel}
          </Button>
          <Button
            type="button"
            variant="dark"
            data-testid="active-limit-confirm"
            onClick={() => {
              if (selectedId !== null) onConfirm(selectedId);
            }}
            disabled={selectedId === null || pending}
            loading={pending}
          >
            {pending ? t.limitPending : t.limitConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
