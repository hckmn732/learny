import { describe, expect, it } from 'vitest';

import { AI_PROVIDERS } from '@learny/db';

import { PROVIDER_CATALOG, providerRegion, providerSupports } from './catalog';

describe('[SPEC-505] catalogue des fournisseurs', () => {
  it('CA-5 — les six fournisseurs exposent hors UE, note et libellés d’ADR-0154', () => {
    expect(Object.keys(PROVIDER_CATALOG)).toEqual([...AI_PROVIDERS]);
    const outsideEuNote = 'Ce fournisseur traite les données hors de l’Union européenne.';
    expect(providerRegion('anthropic')).toEqual({
      outsideEu: true,
      dataNote: outsideEuNote,
      providerLabel: 'Anthropic',
      defaultLabel: 'Anthropic',
    });
    expect(providerRegion('openai')).toEqual({
      outsideEu: true,
      dataNote: outsideEuNote,
      providerLabel: 'OpenAI',
      defaultLabel: 'OpenAI',
    });
    expect(providerRegion('deepseek')).toEqual({
      outsideEu: true,
      dataNote: outsideEuNote,
      providerLabel: 'DeepSeek',
      defaultLabel: 'DeepSeek',
    });
    expect(providerRegion('mistral')).toEqual({
      outsideEu: false,
      dataNote: 'Vérifiez la région de traitement proposée par votre offre.',
      providerLabel: 'Mistral',
      defaultLabel: 'Mistral',
    });
    expect(providerRegion('openai_compatible')).toEqual({
      outsideEu: false,
      dataNote: 'Vérifiez où ce service traite les données avant de l’utiliser.',
      providerLabel: 'Service compatible OpenAI',
      defaultLabel: 'Service compatible OpenAI',
    });
    expect(providerRegion('local')).toEqual({
      outsideEu: false,
      dataNote: 'Les données restent sur votre machine.',
      providerLabel: 'Modèle local',
      defaultLabel: 'Modèle local',
    });
  });

  it('CA-5 — les capacités et les besoins d’adresse restent ceux de SPEC-504', () => {
    expect(providerSupports('anthropic', 'webSearch')).toBe(true);
    expect(providerSupports('openai', 'webSearch')).toBe(false);
    expect(PROVIDER_CATALOG.openai_compatible.requiresBaseUrl).toBe(true);
    expect(PROVIDER_CATALOG.local.requiresBaseUrl).toBe(true);
    expect(PROVIDER_CATALOG.local.keyOptional).toBe(true);
    expect(PROVIDER_CATALOG.openai.keyOptional).toBe(false);
    expect(PROVIDER_CATALOG.anthropic.dataRegion).toBe('outside_eu');
    expect(PROVIDER_CATALOG.mistral.dataRegion).toBeNull();
  });
});
