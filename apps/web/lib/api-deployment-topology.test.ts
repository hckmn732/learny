import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseComposeTopology, readApiDeploymentTopologies } from './api-deployment-topology';

describe('[SPEC-1103] deployment topology', () => {
  it('reads service dependencies from Compose YAML without evaluating secrets', () => {
    const topology = parseComposeTopology(
      [
        'services:',
        '  api:',
        '    depends_on:',
        '      inngest:',
        '        condition: service_healthy',
        '  web:',
        '    depends_on:',
        '      api:',
        '        condition: service_healthy',
        'volumes: {}',
      ].join('\n'),
      'compose.yml',
    );
    expect(topology).toEqual({
      file: 'compose.yml',
      services: [
        { name: 'api', dependencies: ['inngest'] },
        { name: 'web', dependencies: ['api'] },
      ],
    });
  });

  it('loads every repository Compose topology and exposes the API dependency', () => {
    const topologies = readApiDeploymentTopologies();
    expect(topologies.map((topology) => topology.file)).toHaveLength(4);
    for (const topology of topologies) {
      const source = fs.readFileSync(path.join(process.cwd(), topology.file), 'utf8');
      expect(source).toContain('services:');
    }
    const selfhost = topologies.find((topology) => topology.file.includes('selfhost'));
    expect(
      selfhost?.services.find((service) => service.name === 'web')?.dependencies,
    ).toContain('api');
  });
});
