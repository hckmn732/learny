import { describe, expect, it } from 'vitest';

import { AiCredentialCreateBody } from './ai-credentials';

function issuesOf(body: unknown): string[] {
  const result = AiCredentialCreateBody.safeParse(body);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('[SPEC-505] corps de création d’une clé personnelle', () => {
  it('accepte un fournisseur hébergé avec clé et sans adresse', () => {
    expect(
      issuesOf({
        provider: 'anthropic',
        modelIds: ['claude-sonnet-5-5'],
        apiKey: 'sk-ant-12345678',
      }),
    ).toEqual([]);
  });

  it('exige la clé pour tout fournisseur sauf local', () => {
    expect(issuesOf({ provider: 'openai', modelIds: ['gpt'] })).toEqual(['apiKey']);
    expect(
      issuesOf({ provider: 'local', modelIds: ['llama'], baseUrl: 'http://ia.local' }),
    ).toEqual([]);
  });

  it('exige l’adresse pour openai_compatible et local, la refuse ailleurs', () => {
    expect(
      issuesOf({ provider: 'openai_compatible', modelIds: ['m'], apiKey: 'abcdefgh' }),
    ).toEqual(['baseUrl']);
    expect(issuesOf({ provider: 'local', modelIds: ['m'] })).toEqual(['baseUrl']);
    expect(
      issuesOf({
        provider: 'mistral',
        modelIds: ['m'],
        apiKey: 'abcdefgh',
        baseUrl: 'https://api.example.test',
      }),
    ).toEqual(['baseUrl']);
  });

  it('refuse les identifiants de modèle en double', () => {
    expect(issuesOf({ provider: 'anthropic', modelIds: ['a', 'a'], apiKey: 'abcdefgh' })).toEqual([
      'modelIds',
    ]);
  });
});
