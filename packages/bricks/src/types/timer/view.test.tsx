// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { TimerView } from '@learny/bricks/view';

import { cleanup, renderComponent, screen } from '../../test-render';

afterEach(cleanup);

const BRICK = {
  versionId: '00000000-0000-4000-8000-000000000503',
  type: 'timer' as const,
  notionLabels: [],
  publicPayload: {
    durationSec: 600,
    scope: 'activity' as const,
    itemBrickIds: [],
    warnAtSec: 300,
    autoSubmit: true,
    sources: [],
  },
};

function view(now: Date) {
  return (
    <TimerView
      brick={BRICK}
      now={now}
      startedAt={new Date('2026-11-11T12:00:00Z')}
      status="idle"
      value={null}
      variant="exam"
    />
  );
}

describe('[SPEC-503] vue minuteur', () => {
  it('affiche mm:ss et passe à l’orange sous le seuil (CA-7)', () => {
    const { rerender } = renderComponent(view(new Date('2026-11-11T12:02:00Z')));
    const timer = screen.getByTestId('brick-timer');
    expect(timer.textContent).toBe('08:00');
    expect(timer.className).toContain('bg-dark-750');
    rerender(view(new Date('2026-11-11T12:05:01Z')));
    expect(screen.getByTestId('brick-timer').className).toContain('bg-orange');
    expect(screen.getByTestId('brick-timer').getAttribute('aria-label')).toBe(
      'Temps restant : 4 minutes',
    );
  });

  it('annonce « Il reste 5 minutes » exactement une fois (CA-7)', () => {
    const { rerender } = renderComponent(view(new Date('2026-11-11T12:02:00Z')));
    expect(screen.getByTestId('brick-timer-announcement').textContent).toBe('');
    rerender(view(new Date('2026-11-11T12:05:01Z')));
    expect(screen.getByTestId('brick-timer-announcement').textContent).toBe('Il reste 5 minutes');
    rerender(view(new Date('2026-11-11T12:05:02Z')));
    expect(screen.getByTestId('brick-timer-announcement').textContent).toBe('Il reste 5 minutes');
    expect(screen.getAllByText('Il reste 5 minutes')).toHaveLength(1);
  });
});
