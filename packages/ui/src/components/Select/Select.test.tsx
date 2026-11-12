// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { Select } from './Select';

afterEach(cleanup);

describe('[SPEC-302] Select', () => {
  const options = [
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'deepseek', label: 'DeepSeek · ma clé (non qualifié)', disabled: true },
  ];

  it('rend les options fournies et l’habillage formulaire (EF-6)', () => {
    renderComponent(<Select defaultValue="anthropic" label="Modèle" options={options} />);
    const select = screen.getByLabelText('Modèle');
    expect(select.className).toContain('min-h-48');
    expect(select.className).toContain('px-12');
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('garde une option visible mais désactivée (CL-9)', () => {
    renderComponent(<Select defaultValue="anthropic" label="Modèle" options={options} />);
    const disabled = screen.getByRole<HTMLOptionElement>('option', {
      name: 'DeepSeek · ma clé (non qualifié)',
    });
    expect(disabled.disabled).toBe(true);
  });
});
