// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AttemptHistory } from './AttemptHistory';

afterEach(cleanup);

describe('[SPEC-612] historique des tentatives', () => {
  it('CA-1 — une barre et un libellé par tentative, seuil et alternative textuelle', () => {
    render(
      <AttemptHistory
        history={[
          { attemptNo: 1, score: 58, passed: false },
          { attemptNo: 2, score: 72, passed: false },
          { attemptNo: 3, score: 84, passed: true },
        ]}
        threshold={80}
      />,
    );
    expect(screen.getAllByTestId('result-history-bar')).toHaveLength(3);
    expect(screen.getByText('58 %')).toBeTruthy();
    expect(screen.getByText('T3')).toBeTruthy();
    expect(screen.getByTestId('result-history-alt').textContent).toContain(
      'Tentative 3 : 84 %, validée',
    );
  });

  it('EF-2 — seules les six dernières tentatives sont affichées', () => {
    const history = Array.from({ length: 9 }, (_, index) => ({
      attemptNo: index + 1,
      score: 60 + index,
      passed: false,
    }));
    render(<AttemptHistory history={history} threshold={80} />);
    expect(screen.getAllByTestId('result-history-bar')).toHaveLength(6);
    expect(screen.getByText('T9')).toBeTruthy();
    expect(screen.queryByText('T3')).toBeNull();
  });
});
