// [SPEC-2301] The versioned Coolify configuration of the two Python services (ADR-2007).
//
// The two services come from the single image of `docker/api-py.Dockerfile` and differ only by
// their command; every environment entry is a name (a `${…}` interpolation), never a value, so no
// secret can be committed. The migration job stays a singleton the API waits for.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const COMPOSE_FILES = ['docker/compose.coolify.yml', 'docker/compose.coolify-qa.yml'] as const;
const PY_DOCKERFILE = 'docker/api-py.Dockerfile';

type Service = Record<string, unknown>;

interface ComposeDoc {
  services: Record<string, Service>;
}

function readCompose(file: string): { text: string; doc: ComposeDoc } {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  // `merge: true` expands `<<: *py-environment`, comme le fait Docker Compose.
  return { text, doc: YAML.parse(text, { merge: true }) as ComposeDoc };
}

function environment(service: Service): Record<string, unknown> {
  return (service.environment ?? {}) as Record<string, unknown>;
}

function healthcheck(service: Service): { test: string[] } {
  return service.healthcheck as { test: string[] };
}

/** A committed secret would be a literal value: every entry here is an interpolation or a fixed mode. */
const ALLOWED_LITERAL = /^(production|live|mock|resend|smtp|on|off|true|false|worker|enforce|\d+)$/;

describe.each(COMPOSE_FILES)('%s — services Python de la bascule', (file) => {
  const { text, doc } = readCompose(file);
  const api = doc.services['api-py'];
  const worker = doc.services['worker-py'];

  it('declares one image and two commands', () => {
    expect(api, file).toBeDefined();
    expect(worker, file).toBeDefined();
    expect((api.build as { dockerfile: string }).dockerfile).toBe(PY_DOCKERFILE);
    expect((worker.build as { dockerfile: string }).dockerfile).toBe(PY_DOCKERFILE);
    expect(JSON.stringify(api.command)).toContain('uvicorn');
    expect(JSON.stringify(api.command)).toContain('--port 8000');
    expect(JSON.stringify(worker.command)).toContain('python');
    expect(JSON.stringify(worker.command)).toContain('-m');
    expect(JSON.stringify(worker.command)).toContain('learny_worker');
  });

  it('probes /health on the API and /health/live + /health/ready on the worker', () => {
    expect(healthcheck(api).test.join(' ')).toContain('/health');
    expect(healthcheck(api).test.join(' ')).toContain('127.0.0.1:8000');
    const workerProbe = healthcheck(worker).test.join(' ');
    expect(workerProbe).toContain('/health/live');
    expect(workerProbe).toContain('/health/ready');
    expect(workerProbe).toContain('PY_WORKER_HEALTH_PORT');
    expect(environment(worker).PY_WORKER_HEALTH_PORT).toBeDefined();
  });

  it('names every environment variable and commits no secret value', () => {
    for (const service of [api, worker]) {
      const env = environment(service);
      expect(Object.keys(env).length).toBeGreaterThan(10);
      for (const [name, value] of Object.entries(env)) {
        expect(name, `${file} : nom de variable`).toMatch(/^[A-Z][A-Z0-9_]*$/);
        if (typeof value !== 'string') continue;
        // Une variable interpolée depuis Coolify, un mode littéral, un nom de service interne.
        const interpolated = /^\$\{[A-Z0-9_]+(:[-?][^}]*)?\}$/.test(value);
        const literalMode = ALLOWED_LITERAL.test(value);
        const internal =
          /^(http:\/\/[a-z0-9-]+:\d{4,5}|postgresql:\/\/[^@]*\$\{[^}]*\}@[a-z0-9-]+:\d+\/[a-z]+)$/.test(
            value,
          );
        expect(interpolated || literalMode || internal, `${file} : ${name}`).toBe(true);
      }
    }
    // Aucune valeur de secret connue ne doit apparaître en clair dans le fichier.
    expect(text, file).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./);
    expect(text, file).not.toMatch(/sk-[A-Za-z0-9]{10,}/);
    expect(text, file).not.toMatch(/-----BEGIN [A-Z ]+PRIVATE KEY-----/);
  });

  it('limits resources, restarts on failure and waits for the singleton migration job', () => {
    for (const service of [api, worker]) {
      expect(service.restart, file).toBe('unless-stopped');
      const limits = (service.deploy as { resources: { limits: Record<string, string> } }).resources
        .limits;
      expect(limits.memory).toMatch(/^\d+(m|g)$/);
      expect(Number.parseFloat(limits.cpus ?? '0')).toBeGreaterThan(0);
      expect(service.read_only, file).toBe(true);
    }
    const migrate = doc.services.migrate;
    expect(migrate, file).toBeDefined();
    expect(migrate.restart, file).toBe('no');
    // Un seul job de migration : une seule image cible `migrate`, rejouée à chaque déploiement.
    const migrationJobs = Object.entries(doc.services).filter(
      ([, service]) => (service.build as { target?: string } | undefined)?.target === 'migrate',
    );
    expect(migrationJobs.map(([name]) => name)).toEqual(['migrate']);
    // L'API Python attend la fin du job (directement, ou via la graine de la pile de QA).
    const dependencies = api.depends_on as Record<string, { condition: string }>;
    const gate = dependencies.migrate ?? dependencies.seed;
    expect(gate?.condition, file).toBe('service_completed_successfully');
    if (dependencies.seed !== undefined) {
      const seedDependencies = doc.services.seed.depends_on as Record<
        string,
        { condition: string }
      >;
      expect(seedDependencies.migrate?.condition, file).toBe('service_completed_successfully');
    }
  });

  it('keeps the web on Hono until the documented flip', () => {
    // La bascule de `API_INTERNAL_URL` vers http://api-py:8000 est une étape du runbook, réversible
    // en une ligne : la configuration versionnée reste sur la façade Hono (ADR-2005).
    const web = environment(doc.services.web);
    expect(web.API_INTERNAL_URL, file).toBe('http://api:3001');
    // Le repli de la façade Python est la même cible : tout ce qui reste `ts` y est relayé.
    expect(environment(api).PY_HONO_UPSTREAM_URL, file).toBe('http://api:3001');
    // La surcharge vient de l'environnement Coolify, jamais du fichier.
    expect(environment(api).OWNERSHIP_OVERRIDES, file).toBe('${OWNERSHIP_OVERRIDES:-}');
  });
});
