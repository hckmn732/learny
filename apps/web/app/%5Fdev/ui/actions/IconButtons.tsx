'use client';

import { Bell, Plus } from 'lucide-react';

import { CountBadge, IconButton } from '@learny/ui';

import { fr } from '../../../../messages/fr';

const t = fr.ui.gallery.actions.iconButtons;

export function IconButtons() {
  return (
    <div className="flex flex-wrap items-center gap-12">
      <IconButton
        badge={<CountBadge data-testid="ui-count-badge-lime" value={3} />}
        data-testid="ui-icon-button-light"
        icon={Bell}
        label={t.labelWithCount(3)}
      />
      <span className="rounded-12 bg-dark-850 p-8">
        <IconButton
          badge={
            <CountBadge
              data-testid="ui-count-badge-orange-on-dark"
              tone="orange-on-dark"
              value={14}
            />
          }
          data-testid="ui-icon-button-dark"
          icon={Bell}
          label={t.labelWithCount(14)}
          tone="dark"
        />
      </span>
      <IconButton icon={Plus} label={t.add} size="sm" />
      <IconButton icon={Plus} label={t.add} size="xs" />
    </div>
  );
}
