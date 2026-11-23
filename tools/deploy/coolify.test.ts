// [SPEC-2301] The versioned Coolify configuration of the two Python services (ADR-2007).
//
// The services live in an overlay included by the stack (`include:`), so the deployment is the same
// Coolify resource while the topology page of SPEC-1103 keeps its rendered service list — its visual
// baseline is an oracle of another specification (ADR-1001, ADR-2008). The two services come from
// the single image of `docker/api-py.Dockerfile` and differ only by their command; every
// environment entry is a name (a `${…}` interpolation), never a value, so no secret is committed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const STACKS = [
  { base: 'docker/compose.coolify.yml', overlay: './compose.coolify-py.yml' },
  { base: 'docker/compose.coolify-qa.yml', overlay: './compose.coolify-qa-py.yml' },
] as const;
const PY_DOCKERFILE = 'docker/api-py.Dockerfile';

type Service = Record<string, unknown>;

interface ComposeDoc {
  include?: { path: string }[];
  services: Record<string, Service>;
}

function readYaml(relative: string): { text: string; doc: ComposeDoc } {
  const text = fs.readFileSync(path.join(ROOT, relative), 'utf8');
  // `merge: true` expands `<<: *py-environment`, comme le fait Docker Compose.
  return { text, doc: YAML.parse(text, { merge: true }) as ComposeDoc };
}

function overlayFile(overlay: string): string {
  return path.posix.join('docker', overlay.replace('./', ''));
}

/** One service of a parsed Compose document; a missing name is a broken fixture. */
function service(doc: ComposeDoc, name: string): Service {
  const found = doc.services[name];
  if (found === undefined) throw new Error(`service ${name} absent du Compose`);
  return found;
}

function environment(service: Service): Record<string, unknown> {
  return (service.environment ?? {}) as Record<string, unknown>;
}

function healthcheck(service: Service): { test: string[] } {
  return service.healthcheck as { test: string[] };
}

/** A committed secret would be a literal value: every entry is an interpolation or a fixed mode. */
const ALLOWED_LITERAL = /^(production|live|mock|resend|smtp|on|off|true|false|worker|\d+)$/;

describe.each(STACKS)('[SPEC-2301] $base — services Python de la bascule', ({ base, overlay }) => {
  const stack = readYaml(base);
  const python = readYaml(overlayFile(overlay));
  const api = service(python.doc, 'api-py');
  const worker = service(python.doc, 'worker-py');

  it('includes the overlay without touching the rendered topology', () => {
    expect(
      stack.doc.include?.map((entry) => entry.path),
      base,
    ).toContain(overlay);
    // La page de topologie de SPEC-1103 énumère les services du fichier principal : les services
    // Python vivent dans l'inclusion, donc son rendu et sa ligne de base ne changent pas.
    expect(stack.doc.services['api-py'], base).toBeUndefined();
    expect(stack.doc.services['worker-py'], base).toBeUndefined();
  });

  it('declares one image and two commands', () => {
    expect(api, overlay).toBeDefined();
    expect(worker, overlay).toBeDefined();
    expect((api.build as { dockerfile: string }).dockerfile).toBe(PY_DOCKERFILE);
    expect((worker.build as { dockerfile: string }).dockerfile).toBe(PY_DOCKERFILE);
    expect(JSON.stringify(api.command)).toContain('uvicorn');
    expect(JSON.stringify(api.command)).toContain('--port 8000');
    expect(JSON.stringify(worker.command)).toContain('learny_worker');
  });

  it('probes /health on the API and /health/live + /health/ready on the worker', () => {
    expect(healthcheck(api).test.join(' ')).toContain('/health');
    expect(healthcheck(api).test.join(' ')).toContain('127.0.0.1:8000');
    const workerProbe = healthcheck(worker).test.join(' ');
    expect(workerProbe).toContain('/health/live');
    expect(workerProbe).toContain('/health/ready');
    // ADR-2042: the worker health server listens on the standard PORT.
    expect(workerProbe).toContain("os.environ['PORT']");
    expect(environment(worker).PORT).toBeDefined();
  });

  it('names every environment variable and commits no secret value', () => {
    for (const service of [api, worker]) {
      const env = environment(service);
      expect(Object.keys(env).length).toBeGreaterThan(10);
      for (const [name, value] of Object.entries(env)) {
        expect(name, `${overlay} : nom de variable`).toMatch(/^[A-Z][A-Z0-9_]*$/);
        if (typeof value !== 'string') continue;
        const interpolated = /^\$\{[A-Z0-9_]+(:[-?][^}]*)?\}$/.test(value);
        const literalMode = ALLOWED_LITERAL.test(value);
        const internal =
          /^(http:\/\/[a-z0-9-]+:\d{4,5}|postgresql:\/\/[^@]*\$\{[^}]*\}@[a-z0-9-]+:\d+\/[a-z]+)$/.test(
            value,
          );
        expect(interpolated || literalMode || internal, `${overlay} : ${name}`).toBe(true);
      }
    }
    expect(python.text).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./);
    expect(python.text).not.toMatch(/sk-[A-Za-z0-9]{10,}/);
    expect(python.text).not.toMatch(/-----BEGIN [A-Z ]+PRIVATE KEY-----/);
  });

  it('limits resources, restarts on failure and waits for the singleton migration job', () => {
    for (const service of [api, worker]) {
      expect(service.restart, overlay).toBe('unless-stopped');
      const limits = (service.deploy as { resources: { limits: Record<string, string> } }).resources
        .limits;
      expect(limits.memory).toMatch(/^\d+(m|g)$/);
      expect(Number.parseFloat(limits.cpus ?? '0')).toBeGreaterThan(0);
      expect(service.read_only).toBe(true);
    }
    const migrate = service(stack.doc, 'migrate');
    expect(migrate, base).toBeDefined();
    expect(migrate.restart, base).toBe('no');
    const migrationJobs = Object.entries(stack.doc.services).filter(
      ([, service]) => (service.build as { target?: string } | undefined)?.target === 'migrate',
    );
    expect(migrationJobs.map(([name]) => name)).toEqual(['migrate']);
    const dependencies = api.depends_on as Record<string, { condition: string }>;
    const gate = dependencies.migrate ?? dependencies.seed;
    expect(gate?.condition, overlay).toBe('service_completed_successfully');
    if (dependencies.seed !== undefined) {
      const seedDependencies = service(stack.doc, 'seed').depends_on as Record<
        string,
        { condition: string }
      >;
      expect(seedDependencies.migrate?.condition, base).toBe('service_completed_successfully');
    }
  });

  it('keeps the web on Hono until the documented flip', () => {
    const web = environment(service(stack.doc, 'web'));
    expect(web.API_INTERNAL_URL, base).toBe('http://api:3001');
    expect(environment(api).PY_HONO_UPSTREAM_URL, overlay).toBe('http://api:3001');
    expect(environment(api).OWNERSHIP_OVERRIDES, overlay).toBe('${OWNERSHIP_OVERRIDES:-}');
  });
});
