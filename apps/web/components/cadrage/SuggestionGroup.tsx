import { Check } from 'lucide-react';

import type { CadrageSuggestion } from '@learny/contracts';

import { fr } from '../../messages/fr';

const t = fr.cadrage;

export interface SuggestionGroupProps {
  suggestions: readonly CadrageSuggestion[];
  multi: boolean;
  selected: ReadonlySet<string>;
  disabled?: boolean;
  onToggle: (value: string) => void;
  onPick: (label: string) => void;
}

/**
 * EF-6 — tappable answers. A single choice sends its label immediately; a multiple choice toggles
 * its values and is sent by the reply bar. Every button keeps `aria-pressed` and is keyboard
 * operable with Tab, Space and Enter.
 */
export const SuggestionGroup = ({
  suggestions,
  multi,
  selected,
  disabled = false,
  onToggle,
  onPick,
}: SuggestionGroupProps) => (
  <div
    aria-label={t.suggestionsLabel}
    className="grid grid-cols-1 gap-10 [@media(min-width:480px)]:grid-cols-2 [@media(min-width:720px)]:grid-cols-3"
    role="group"
  >
    {suggestions.map((suggestion) => {
      const pressed = selected.has(suggestion.value);
      return (
        <button
          aria-pressed={pressed}
          className={[
            'flex min-h-132 cursor-pointer flex-col items-start gap-8 rounded-20 p-16 text-left font-sans',
            pressed
              ? 'border-0 bg-ink text-white'
              : 'border border-solid border-border-strong bg-surface text-ink',
            disabled ? 'cursor-not-allowed opacity-55' : 'hover:border-ink',
          ].join(' ')}
          data-testid={`cadrage-suggestion-${suggestion.value}`}
          disabled={disabled}
          key={suggestion.value}
          onClick={() => {
            if (multi) onToggle(suggestion.value);
            else onPick(suggestion.label);
          }}
          type="button"
        >
          <span
            aria-hidden="true"
            className={[
              'flex h-24 w-24 items-center justify-center rounded-8',
              pressed
                ? 'bg-lime text-ink'
                : 'border-[1.5px] border-solid border-border-dashed text-transparent',
            ].join(' ')}
          >
            <Check size={12} strokeWidth={3.2} />
          </span>
          <span className="text-15 leading-1.3 font-700">{suggestion.label}</span>
          {suggestion.description === null ? null : (
            <span className="text-13 leading-1.45 opacity-85">{suggestion.description}</span>
          )}
        </button>
      );
    })}
  </div>
);
