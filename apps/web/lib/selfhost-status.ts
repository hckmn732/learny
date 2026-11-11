// Read-only snapshot of the self-hosted stack for the SPEC-012 demo page (SPEC-012, EF-6).
// The source of truth is the JSON published by tools/docker/check-selfhost.mjs; this module
// never runs Docker and never reads .env.selfhost, so no secret can reach the page.
import fs from 'node:fs';
import path from 'node:path';

import { findRepoRoot } from './sdd-status';

export const SELFHOST_CHAINS = [
  { source: 'Web', target: 'Supabase / Inngest' },
  { source: 'Worker', target: 'Inngest' },
] as const;

export const SELFHOST_COMPOSE_SERVICES = [
  'web',
  'worker',
  'kong',
  'auth',
  'rest',
  'storage',
  'db',
  'inngest',
  'migrate',
] as const;

export const SELFHOST_PINNED_IMAGES = [
  { name: 'supabase/postgres', version: '17.11.0.006' },
  { name: 'supabase/gotrue', version: 'v2.197.0' },
  { name: 'supabase/storage-api', version: 'v1.84.19' },
  { name: 'supabase/postgrest', version: 'v16.5' },
  { name: 'supabase/kong', version: '2.8.1' },
  { name: 'inngest/inngest', version: 'v1.52.0' },
  { name: 'axllent/mailpit', version: 'v1.33.1' },
] as const;

export const SELFHOST_PROBES = [
  { name: 'web', target: '/api/v1/health' },
  { name: 'worker', target: '/health' },
  { name: 'postgres', target: 'pg_isready -U postgres' },
  { name: 'auth', target: '/health' },
  { name: 'storage', target: '/status' },
  { name: 'rest', target: '/' },
  { name: 'inngest', target: '/health' },
  { name: 'kong', target: 'kong health' },
] as const;

export const SELFHOST_COMMANDS = [
  'docker compose --env-file .env.selfhost -f docker/compose.selfhost.yml config --quiet',
  'GIT_COMMIT="$(git rev-parse HEAD)" docker compose --env-file .env.selfhost -f docker/compose.selfhost.yml up -d --build',
  'node tools/docker/check-selfhost.mjs --env-file .env.selfhost --up --project learny-selfhost',
  'docker compose --env-file .env.selfhost -f docker/compose.selfhost.yml down',
] as const;

export const SELFHOST_VOLUMES = ['db-data', 'storage-data', 'inngest-data'] as const;

export interface SelfhostServiceStatus {
  name: string;
  state: string;
}

export interface SelfhostImageStatus {
  name: string;
  version: string;
  commit: string;
  state: string;
}

export interface SelfhostProbeStatus {
  name: string;
  target: string;
  state: string;
}

export interface SelfhostSnapshot {
  demo: boolean;
  available: boolean;
  services: SelfhostServiceStatus[];
  images: SelfhostImageStatus[];
  health: SelfhostProbeStatus[];
  volumes: string[];
  commands: readonly string[];
}

interface CachedCheck {
  services?: { name?: string; state?: string; health?: string }[];
  images?: { name?: string; version?: string; commit?: string; user?: string }[];
  health?: { name?: string; target?: string; ok?: boolean }[];
  volumes?: string[];
}

function fromCheck(raw: CachedCheck): SelfhostSnapshot {
  const states = new Map((raw.services ?? []).map((service) => [service.name, service]));
  const services = SELFHOST_COMPOSE_SERVICES.map((name) => {
    const service = states.get(name);
    if (service === undefined) return { name, state: 'Non vérifié' };
    if (name === 'migrate')
      return {
        name,
        state: service.state === 'exited' ? 'terminé' : (service.state ?? 'Non vérifié'),
      };
    return {
      name,
      state:
        service.health === '' || service.health === undefined
          ? (service.state ?? 'Non vérifié')
          : service.health,
    };
  });
  const found = new Map((raw.images ?? []).map((image) => [image.name, image]));
  const local = (['web', 'worker'] as const).map((name) => {
    const image = found.get(name);
    return {
      name: `learny-${name}`,
      version: image?.version ?? 'Non vérifié',
      commit: image?.commit ?? 'Non vérifié',
      state:
        image === undefined
          ? 'Non vérifié'
          : `construite · ${image.user ?? 'utilisateur non vérifié'}`,
    };
  });
  const pinned = SELFHOST_PINNED_IMAGES.map((image) => ({
    name: image.name,
    version: image.version,
    commit: '—',
    state: image.name === 'axllent/mailpit' ? 'épinglée · profil local' : 'épinglée',
  }));
  const health = SELFHOST_PROBES.map((probe) => {
    const result = (raw.health ?? []).find((candidate) => candidate.name === probe.name);
    return {
      name: probe.name,
      target: probe.target,
      state: result === undefined ? 'Non vérifié' : result.ok === true ? 'ok' : 'échec',
    };
  });
  return {
    demo: false,
    available: true,
    services,
    images: [...local, ...pinned],
    health,
    volumes: raw.volumes ?? [],
    commands: SELFHOST_COMMANDS,
  };
}

function simulated(): SelfhostSnapshot {
  return {
    demo: true,
    available: true,
    services: SELFHOST_COMPOSE_SERVICES.map((name) => ({ name, state: 'Démonstration' })),
    images: [
      { name: 'learny-web', version: 'démo', commit: 'démo', state: 'Démonstration' },
      { name: 'learny-worker', version: 'démo', commit: 'démo', state: 'Démonstration' },
      ...SELFHOST_PINNED_IMAGES.map((image) => ({
        name: image.name,
        version: image.version,
        commit: '—',
        state: 'épinglée',
      })),
    ],
    health: SELFHOST_PROBES.map((probe) => ({
      name: probe.name,
      target: probe.target,
      state: 'Démonstration',
    })),
    volumes: [...SELFHOST_VOLUMES],
    commands: SELFHOST_COMMANDS,
  };
}

function unverified(): SelfhostSnapshot {
  return {
    demo: false,
    available: false,
    services: SELFHOST_COMPOSE_SERVICES.map((name) => ({ name, state: 'Non vérifié' })),
    images: [
      { name: 'learny-web', version: 'Non vérifié', commit: 'Non vérifié', state: 'Non vérifié' },
      {
        name: 'learny-worker',
        version: 'Non vérifié',
        commit: 'Non vérifié',
        state: 'Non vérifié',
      },
      ...SELFHOST_PINNED_IMAGES.map((image) => ({
        name: image.name,
        version: image.version,
        commit: '—',
        state: 'épinglée',
      })),
    ],
    health: SELFHOST_PROBES.map((probe) => ({
      name: probe.name,
      target: probe.target,
      state: 'Non vérifié',
    })),
    volumes: [],
    commands: SELFHOST_COMMANDS,
  };
}

/**
 * Real state when `check-selfhost.mjs --up` published a snapshot, an explicitly labelled
 * demonstration in SDD captures, otherwise "Non vérifié" values only.
 */
export function readSelfhostStatus(root = findRepoRoot()): SelfhostSnapshot {
  if (process.env.SDD_STACK_DEMO === 'true') return simulated();
  if (root === null) return unverified();
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(root, '.sdd', 'tmp', 'selfhost-check.json'), 'utf8'),
    ) as CachedCheck;
    return fromCheck(raw);
  } catch {
    return unverified();
  }
}
