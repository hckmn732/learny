'use client';

import { Search } from 'lucide-react';

import { TextField } from '@learny/ui';

import { fr } from '../../../../messages/fr';

const t = fr.ui.gallery.saisie.textFields;

export function SearchTextField() {
  return (
    <TextField
      data-testid="ui-textfield-search"
      label={t.searchLabel}
      leadingIcon={Search}
      placeholder={t.searchPlaceholder}
      type="search"
      variant="search"
    />
  );
}
