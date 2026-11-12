'use client';

import { useState } from 'react';

import { SegmentedControl, Switch } from '@learny/ui';

import { fr } from '../../../../messages/fr';

const t = fr.ui.gallery.saisie;

const NOTIFICATION_FILTERS = [
  { value: 'toutes', label: t.segmented.softA, count: 8 },
  { value: 'non-lues', label: t.segmented.softB, count: 3 },
  { value: 'archivees', label: t.segmented.softC },
] as const;

const AGENDA_VIEWS = [
  { value: 'jour', label: t.segmented.solidA },
  { value: 'semaine', label: t.segmented.solidB },
  { value: 'mois', label: t.segmented.solidC },
] as const;

export function Switches() {
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);

  return (
    <div className="flex flex-col gap-16">
      <Switch
        checked={on}
        data-testid="ui-switch-on"
        description={t.switches.onDescription}
        label={t.switches.onLabel}
        onCheckedChange={setOn}
      />
      <Switch
        checked={off}
        data-testid="ui-switch-off"
        label={t.switches.offLabel}
        onCheckedChange={setOff}
      />
      <Switch
        checked
        data-testid="ui-switch-locked"
        description={t.switches.lockedDescription}
        label={t.switches.lockedLabel}
        locked
        onCheckedChange={() => {
          // Locked: the value never changes (EF-8).
        }}
      />
    </div>
  );
}

export function SegmentedControls() {
  const [filter, setFilter] = useState<(typeof NOTIFICATION_FILTERS)[number]['value']>('toutes');
  const [view, setView] = useState<(typeof AGENDA_VIEWS)[number]['value']>('semaine');

  return (
    <div className="flex flex-col gap-16">
      <SegmentedControl
        aria-label={t.segmented.softLabel}
        data-testid="ui-segmented-soft"
        onValueChange={setFilter}
        options={[...NOTIFICATION_FILTERS]}
        value={filter}
      />
      <SegmentedControl
        aria-label={t.segmented.solidLabel}
        data-testid="ui-segmented-solid"
        onValueChange={setView}
        options={[...AGENDA_VIEWS]}
        size="md"
        value={view}
        variant="solid"
      />
      <SegmentedControl
        aria-label={t.segmented.solidLabel}
        fullWidth
        onValueChange={setView}
        options={[...AGENDA_VIEWS]}
        value={view}
        variant="solid"
      />
    </div>
  );
}
