// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './Tooltip';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  globalThis.ResizeObserver = ResizeObserverMock;
});

afterEach(cleanup);

describe('[SPEC-303] infobulle', () => {
  it('rend le contenu sombre avec sa flèche quand elle est ouverte (EF-11)', () => {
    renderComponent(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger asChild>
            <button type="button">Aide</button>
          </TooltipTrigger>
          <TooltipContent className="extra">Explication</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    const content = screen.getAllByText('Explication')[0];
    const box = content?.closest('[data-state]') ?? content?.parentElement;
    expect(box?.className).toContain('bg-ink');
    expect(box?.className).toContain('extra');
  });
});
