'use client';

import { useState } from 'react';

import { Chip } from '@learny/ui';

import { fr } from '../../../../messages/fr';

const t = fr.ui.gallery.actions.chips;

export function Chips() {
  const [rounded, setRounded] = useState(true);
  const [pill, setPill] = useState(true);
  const [longPill, setLongPill] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-12">
      <Chip
        ariaLabel="Lundi"
        data-testid="ui-chip-rounded"
        onPressedChange={setRounded}
        pressed={rounded}
      >
        {t.rounded}
      </Chip>
      <Chip
        count={4}
        data-testid="ui-chip-pill"
        onPressedChange={setPill}
        pressed={pill}
        shape="pill"
      >
        {t.pill}
      </Chip>
      <Chip count={12} onPressedChange={setLongPill} pressed={longPill} shape="pill" size="sm">
        {t.long}
      </Chip>
    </div>
  );
}
