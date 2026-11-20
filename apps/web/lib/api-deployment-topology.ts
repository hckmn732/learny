import fs from 'node:fs';
import path from 'node:path';

import { findRepoRoot } from './sdd-status';

const COMPOSE_FILES = [
  'docker/compose.dev.yml',
  'docker/compose.selfhost.yml',
  'docker/compose.coolify.yml',
  'docker/compose.coolify-qa.yml',
] as const;

export interface ComposeService {
  name: string;
  dependencies: string[];
}

export interface ComposeTopology {
  file: string;
  services: ComposeService[];
}

const FALLBACK: ComposeTopology[] = [
  {
    file: COMPOSE_FILES[0],
    services: [{ name: 'inngest', dependencies: [] }, { name: 'mailpit', dependencies: [] }],
  },
  {
    file: COMPOSE_FILES[1],
    services: [
      { name: 'web', dependencies: ['migrate', 'db', 'auth', 'rest', 'storage', 'inngest', 'api'] },
      { name: 'api', dependencies: ['inngest', 'migrate'] },
    ],
  },
  {
    file: COMPOSE_FILES[2],
    services: [
      { name: 'web', dependencies: ['migrate', 'db', 'auth', 'rest', 'storage', 'inngest', 'api'] },
      { name: 'api', dependencies: ['inngest', 'migrate'] },
    ],
  },
  {
    file: COMPOSE_FILES[3],
    services: [
      { name: 'web', dependencies: ['seed', 'db', 'auth', 'rest', 'storage', 'inngest', 'api'] },
      { name: 'api', dependencies: ['inngest', 'seed'] },
    ],
  },
];

export function parseComposeTopology(source: string, file: string): ComposeTopology {
  const services: ComposeService[] = [];
  let inServices = false;
  let current: ComposeService | null = null;
  let inDependencies = false;

  for (const line of source.split('\n')) {
    if (/^services:\s*$/.test(line)) {
      inServices = true;
      continue;
    }
    if (!inServices) continue;
    const service = /^[ ]{2}([a-z0-9-]+):\s*$/.exec(line);
    if (service !== null) {
      current = { name: service[1] ?? '', dependencies: [] };
      services.push(current);
      inDependencies = false;
      continue;
    }
    if (current !== null && /^[ ]{4}depends_on:\s*$/.test(line)) {
      inDependencies = true;
      continue;
    }
    if (inDependencies && current !== null) {
      const dependency = /^[ ]{6}([a-z0-9-]+):\s*$/.exec(line);
      if (dependency !== null) current.dependencies.push(dependency[1] ?? '');
      else if (!/^[ ]{8}/.test(line) && line.trim() !== '') inDependencies = false;
    }
    if (/^(?:volumes|networks):\s*$/.test(line)) break;
  }
  return { file, services };
}

export function readApiDeploymentTopologies(root = findRepoRoot()): ComposeTopology[] {
  if (root === null) return FALLBACK;
  try {
    return COMPOSE_FILES.map((file) =>
      parseComposeTopology(fs.readFileSync(path.join(root, file), 'utf8'), file),
    );
  } catch {
    return FALLBACK;
  }
}
