'use client';

import { useState } from 'react';

import { ChoiceGroup } from '@learny/ui';

import { fr } from '../../../../messages/fr';

const t = fr.ui.gallery.saisie.choice;

export function ChoiceCards() {
  const [value, setValue] = useState('magic');

  return (
    <div className="max-w-[30rem]" data-testid="ui-choice-cards">
      <ChoiceGroup
        aria-label={t.label}
        onValueChange={setValue}
        options={[
          {
            value: 'magic',
            label: t.magic,
            description: t.magicDescription,
            testId: 'ui-choice-magic',
          },
          {
            value: 'password',
            label: t.password,
            description: t.passwordDescription,
            testId: 'ui-choice-password',
          },
        ]}
        value={value}
      />
    </div>
  );
}
