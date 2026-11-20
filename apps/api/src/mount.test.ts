import { describe, expect, it } from 'vitest';

import { methodsForPath, pathMatches } from './mount';

describe('[SPEC-1101] mount', () => {
  it('traduit les paramètres et les méthodes du registre Hono', () => {
    expect(pathMatches('/api/v1/formations/:fid', '/api/v1/formations/abc')).toBe(true);
    expect(pathMatches('/api/v1/formations/:fid', '/api/v1/formations/abc/extra')).toBe(false);
    expect(methodsForPath('/api/v1/conversations/example/messages')).toEqual(['POST']);
    expect(methodsForPath('/api/v1/me/ai/models')).toEqual(['GET', 'PATCH']);
  });

  it('annonce les verbes pris en charge sur un chemin connu', () => {
    expect(methodsForPath('/api/v1/health')).toEqual(['GET']);
    expect(methodsForPath('/api/v1/route-inconnue')).toEqual([]);
  });
});
