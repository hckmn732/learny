'use client';

import { useState } from 'react';

import { fr } from '@learny/i18n/fr/simple';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@learny/ui';

import { SimpleChoiceCards } from './choice-cards';

const t = fr.simple.choice;

export interface NewFormationButtonProps {
  label: string;
}

/**
 * SPEC-4002 EF-1 — le bouton d'en-tête « Nouvelle formation » ouvre les deux mêmes cartes que
 * l'accueil (SCR-03) : le choix se fait sans quitter la page, et chaque carte mène à sa route.
 */
export function NewFormationButton({ label }: NewFormationButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        data-testid="home-new-formation"
        onClick={() => {
          setOpen(true);
        }}
        size="md"
        type="button"
        variant="lime"
      >
        + {label}
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent data-testid="new-formation-dialog">
          <DialogTitle id="new-formation-title">{t.dialogTitle}</DialogTitle>
          <DialogDescription id="new-formation-description" className="mb-16">
            {t.dialogDescription}
          </DialogDescription>
          <SimpleChoiceCards
            onNavigate={() => {
              setOpen(false);
            }}
            variant="dialog"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
