// [SPEC-4002] Pages web remplacées par un écran natif (rattrapage mobile).
import { describe, expect, it } from 'vitest';

import { nativeRouteFor } from './native-routes';

const FID = '79c6d8b4-ee55-5f27-9da1-e958882bfdfc';
const MID = 'cc5035ad-7ab4-597e-a2af-15a815151f4d';
const AID = 'd22ba132-ff0a-5497-8eac-98e3b946bbad';

describe('[SPEC-4002] routes natives des pages web', () => {
  it('ouvre le cadrage et la proposition dans l’application', () => {
    expect(nativeRouteFor('/formations/nouvelle')).toBe('/programme/cadrage');
    expect(nativeRouteFor(`/formations/${FID}/cadrage`)).toBe(`/programme/cadrage?fid=${FID}`);
    expect(nativeRouteFor(`/formations/${FID}/programme`)).toBe(`/programme/proposition/${FID}`);
  });

  it('ouvre bilan, carte, groupe, lacunes, recherche et exercice dans l’application', () => {
    expect(nativeRouteFor(`/formations/${FID}/bilan`)).toBe(`/programme/bilan/${FID}`);
    expect(nativeRouteFor(`/formations/${FID}/carte`)).toBe(`/programme/carte/${FID}`);
    expect(nativeRouteFor(`/formations/${FID}/groupe`)).toBe(`/programme/groupe/${FID}`);
    expect(nativeRouteFor('/lacunes')).toBe('/aujourdhui/lacunes');
    expect(nativeRouteFor('/recherche?q=compta')).toBe('/programme/recherche?q=compta');
    expect(nativeRouteFor(`/formations/${FID}/modules/${MID}/exercices/${AID}`)).toBe(
      `/exercice/${AID}?fid=${FID}&mid=${MID}`,
    );
    expect(nativeRouteFor('/parametres#modeles')).toBe('/profil/modeles');
  });

  it('laisse sur le web les pages sans équivalent natif', () => {
    expect(nativeRouteFor('/parametres')).toBeNull();
    expect(nativeRouteFor('/legal/cgu')).toBeNull();
    expect(nativeRouteFor(`/formations/${FID}/examen-blanc`)).toBeNull();
  });
});
