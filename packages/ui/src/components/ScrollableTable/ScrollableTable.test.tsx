// @vitest-environment jsdom
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { ScrollableTable } from './ScrollableTable';

afterEach(cleanup);

describe('[SPEC-802] ScrollableTable', () => {
  it('expose une région défilante nommée et focusable', () => {
    renderComponent(
      <ScrollableTable label="Membres du groupe">
        <table>
          <caption>Membres du groupe</caption>
          <tbody>
            <tr>
              <td>Alice</td>
            </tr>
          </tbody>
        </table>
      </ScrollableTable>,
    );
    const region = document.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toBe('Membres du groupe');
    expect(region?.getAttribute('tabindex')).toBe('0');
    expect(region?.className).toContain('overflow-x-auto');
    // Containing block of visually hidden cell labels (they must not widen the page).
    expect(region?.className).toContain('relative');
  });
});
