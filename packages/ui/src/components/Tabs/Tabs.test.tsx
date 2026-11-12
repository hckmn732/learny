// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';

afterEach(cleanup);

function GalleryTabs({ variant }: Readonly<{ variant?: 'soft' | 'solid' }>) {
  return (
    <Tabs defaultValue="profil">
      <TabsList aria-label="Paramètres" variant={variant}>
        <TabsTrigger value="profil">Profil</TabsTrigger>
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
        <TabsTrigger value="apprentissage">Apprentissage</TabsTrigger>
      </TabsList>
      <TabsContent value="profil">Panneau profil</TabsContent>
      <TabsContent value="notifications">Panneau notifications</TabsContent>
      <TabsContent value="apprentissage">Panneau apprentissage</TabsContent>
    </Tabs>
  );
}

describe('[SPEC-302] Tabs', () => {
  it('respecte le motif ARIA tabs (CA-3)', () => {
    renderComponent(<GalleryTabs />);
    const tablist = screen.getByRole('tablist', { name: 'Paramètres' });
    expect(tablist.className).toContain('bg-canvas');
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[0]?.getAttribute('aria-controls')).toBeTruthy();
    expect(screen.getByRole('tabpanel').textContent).toBe('Panneau profil');
    expect(screen.queryByText('Panneau notifications')).toBeNull();
  });

  it('active l’onglet suivant avec les flèches, en boucle (CL-3)', async () => {
    const { user } = renderComponent(<GalleryTabs />);
    const tabs = screen.getAllByRole('tab');
    tabs[0]?.focus();
    await user.keyboard('{ArrowRight}');
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').textContent).toBe('Panneau notifications');
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{End}');
    expect(tabs[2]?.getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{Home}');
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
  });

  it('un seul contrôle dans l’ordre de tabulation (CA-3)', () => {
    renderComponent(<GalleryTabs />);
    const tablist = screen.getByRole('tablist', { name: 'Paramètres' });
    const tabs = screen.getAllByRole('tab');
    const tabStops = [tablist, ...tabs].filter((element) => element.tabIndex === 0);
    expect(tabStops).toHaveLength(1);
    expect(
      tabs.filter((tab) => tab.tabIndex === 0).length,
      'au plus un onglet sélectionné',
    ).toBeLessThanOrEqual(1);
  });

  it('variante solid : selected fond ink', () => {
    renderComponent(<GalleryTabs variant="solid" />);
    const tablist = screen.getByRole('tablist', { name: 'Paramètres' });
    expect(tablist.className).toContain('rounded-14');
    expect(tablist.className).toContain('border-border');
    expect(screen.getAllByRole('tab')[0]?.className).toContain('data-[state=active]:bg-ink');
  });
});
