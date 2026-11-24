// Vitest [SPEC-3102] — the five tabs of the shell (EF-1, CA-1, ET-5).
import { describe, expect, it } from 'vitest';

import { fr } from '@learny/i18n';

import { INITIAL_TAB, TABS, TAB_NAMES, tabIndex, tabOfRoute, tabPressEffect } from './tabs';

describe('[SPEC-3102] onglets du shell', () => {
  it('déclare les cinq destinations, dans l’ordre de la maquette (EF-1, CA-1)', () => {
    expect(TABS.map((tab) => tab.name)).toEqual([...TAB_NAMES]);
    expect(TABS.map((tab) => tab.label)).toEqual([
      'Aujourd’hui',
      'Programme',
      'Réviser',
      'Agenda',
      'Profil',
    ]);
  });

  it('donne le `testID` et le chemin de chaque onglet (CA-1)', () => {
    expect(TABS.map((tab) => tab.testID)).toEqual([
      'tab-aujourdhui',
      'tab-programme',
      'tab-reviser',
      'tab-agenda',
      'tab-profil',
    ]);
    expect(TABS.map((tab) => tab.href)).toEqual([
      '/aujourdhui',
      '/programme',
      '/reviser',
      '/agenda',
      '/profil',
    ]);
  });

  it('porte les cinq icônes de la maquette — maison, couches, cartes, calendrier, personne', () => {
    expect(TABS.map((tab) => tab.icon)).toEqual(['home', 'layers', 'cards', 'calendar', 'user']);
  });

  it('commence sur Aujourd’hui (EF-1)', () => {
    expect(INITIAL_TAB).toBe('aujourdhui');
    expect(TAB_NAMES[0]).toBe(INITIAL_TAB);
    expect(tabIndex('aujourdhui')).toBe(0);
    expect(tabIndex('inconnu')).toBe(-1);
  });

  it('annonce chaque onglet avec son rang (ET-5)', () => {
    expect(TABS[0]?.accessibilityLabel).toBe('Aujourd’hui, onglet 1 sur 5');
    expect(TABS[4]?.accessibilityLabel).toBe('Profil, onglet 5 sur 5');
    expect(fr.mobile.shell.tabs.position('Agenda', 4, 5)).toBe('Agenda, onglet 4 sur 5');
  });

  it('résout un nom de route et refuse les autres (ADR-0046)', () => {
    expect(tabOfRoute('agenda')?.name).toBe('agenda');
    expect(tabOfRoute('cours')).toBeNull();
  });

  it('un appui sur l’onglet actif revient à la racine de sa pile (EF-1, CA-1)', () => {
    expect(tabPressEffect('aujourdhui', 'aujourdhui')).toBe('reselect');
    expect(tabPressEffect('aujourdhui', 'profil')).toBe('select');
  });
});
