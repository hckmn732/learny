// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import {
  Award,
  BarChart3,
  Bell,
  BookOpen,
  CalendarX,
  CircleAlert,
  CircleCheck,
  Copy,
  Download,
  Gauge,
  House,
  PlayCircle,
  RefreshCw,
  Sun,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { Icon } from './Icon';
import { iconRegistry } from './registry';

afterEach(cleanup);

describe('[SPEC-303] Icon', () => {
  it('aligne le registre sur les icônes lucide de EF-17', () => {
    expect(iconRegistry.home).toBe(House);
    expect(iconRegistry.bell).toBe(Bell);
    expect(iconRegistry['global-quiz']).toBe(Copy);
    expect(iconRegistry['check-circle']).toBe(CircleCheck);
    expect(iconRegistry.alert).toBe(TriangleAlert);
    // SPEC-306 adds the notification-template icons; the original shell names stay unchanged.
    expect(iconRegistry['book-open']).toBe(BookOpen);
    expect(iconRegistry.refresh).toBe(RefreshCw);
    expect(iconRegistry['calendar-x']).toBe(CalendarX);
    expect(iconRegistry['bar-chart']).toBe(BarChart3);
    expect(iconRegistry.award).toBe(Award);
    expect(iconRegistry.gauge).toBe(Gauge);
    expect(iconRegistry['alert-circle']).toBe(CircleAlert);
    expect(iconRegistry.download).toBe(Download);
    expect(iconRegistry.users).toBe(Users);
    expect(iconRegistry.sun).toBe(Sun);
    expect(iconRegistry['play-circle']).toBe(PlayCircle);
    expect(Object.keys(iconRegistry)).toHaveLength(35);
  });

  it('rend une icône décorative de 18 px trait 1,8 par défaut', () => {
    renderComponent(<Icon data-testid="icon" name="home" />);
    const svg = screen.getByTestId('icon');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('width')).toBe('18');
    expect(svg.getAttribute('stroke-width')).toBe('1.8');
  });

  it('accepte taille et épaisseur explicites', () => {
    renderComponent(<Icon data-testid="icon-lg" name="alert" size={28} strokeWidth={2} />);
    const svg = screen.getByTestId('icon-lg');
    expect(svg.getAttribute('width')).toBe('28');
    expect(svg.getAttribute('stroke-width')).toBe('2');
  });
});
