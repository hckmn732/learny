import { describe, expect, test } from 'vitest';

import {
  EXPECTED_VOLUMES,
  HEALTHCHECKED_SERVICES,
  PUBLISHED_SERVICES,
  REQUIRED_SERVICES,
  missingRequiredVariables,
  parseComposeYaml,
  requiredVariables,
  readFile,
  validateComposeDocument,
  validateDockerfile,
  validateDockerignore,
  validateGuide,
} from './check-selfhost.mjs';
import { createJwt, serviceKeys } from './selfhost-secrets.mjs';

const composeText = readFile('docker/compose.selfhost.yml');

describe('[SPEC-012] selfhost config', () => {
  test('déclare les services, volumes et contrôles de santé attendus', () => {
    const doc = parseComposeYaml(composeText);
    expect(validateComposeDocument(doc, composeText)).toEqual([]);
    for (const service of REQUIRED_SERVICES) expect(doc.services[service]).toBeDefined();
    for (const volume of Object.keys(EXPECTED_VOLUMES)) {
      expect(doc.volumes?.[volume]).toBeDefined();
    }
    for (const service of HEALTHCHECKED_SERVICES) {
      expect(doc.services[service]?.healthcheck).toBeDefined();
    }
    expect(doc.services.mailpit?.profiles).toEqual(['local']);
  });

  test('refuse une variable obligatoire absente et documente la syntaxe :?', () => {
    const declared = requiredVariables(composeText);
    for (const name of [
      'POSTGRES_PASSWORD',
      'SUPABASE_JWT_SECRET',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'APP_ENCRYPTION_KEY',
      'RATE_LIMIT_IP_SECRET',
      'EMAIL_LINK_SECRET',
      'INNGEST_EVENT_KEY',
      'INNGEST_SIGNING_KEY',
      'GIT_COMMIT',
      'LEARNY_PUBLIC_APP_URL',
      'LEARNY_PUBLIC_SUPABASE_URL',
    ]) {
      expect(declared).toContain(name);
    }
    const missing = missingRequiredVariables(composeText, { POSTGRES_PASSWORD: 'x' });
    expect(missing).toContain('SUPABASE_JWT_SECRET');
    expect(missing).not.toContain('POSTGRES_PASSWORD');
    expect(missingRequiredVariables(composeText, { POSTGRES_PASSWORD: '' })).toContain(
      'POSTGRES_PASSWORD',
    );
  });

  test('n’expose que les ports d’accès et garde les données sur le réseau interne', () => {
    const doc = parseComposeYaml(composeText);
    for (const service of PUBLISHED_SERVICES) {
      expect((doc.services[service]?.ports ?? []).length).toBeGreaterThan(0);
    }
    for (const service of ['db', 'migrate', 'auth', 'rest', 'storage', 'worker']) {
      expect(doc.services[service]?.ports ?? []).toEqual([]);
    }
    expect(doc.networks?.backend?.internal).toBe(true);
    expect(doc.services.web?.networks).toContain('egress');
  });

  test('épingle toutes les images et refuse latest', () => {
    const doc = parseComposeYaml(composeText);
    const images = Object.values(doc.services as Record<string, { image?: string }>).map(
      (service) => service.image,
    );
    expect(images).toEqual(
      expect.arrayContaining([
        'public.ecr.aws/supabase/postgres:17.11.0.006',
        'public.ecr.aws/supabase/gotrue:v2.197.0',
        'public.ecr.aws/supabase/postgrest:v16.5',
        'public.ecr.aws/supabase/storage-api:v1.84.19',
        'public.ecr.aws/supabase/kong:2.8.1',
        'inngest/inngest:v1.52.0',
        'axllent/mailpit:v1.33.1',
      ]),
    );
    for (const image of images) expect(image).not.toMatch(/:latest$/);
  });

  test('Dockerfiles : lockfile gelé, multi-étapes, non root, sans fichier .env', () => {
    for (const file of ['docker/web.Dockerfile', 'docker/worker.Dockerfile']) {
      const text = readFile(file);
      expect(validateDockerfile(text), file).toEqual([]);
      expect(text).toContain('pnpm install --frozen-lockfile');
      expect(text).not.toMatch(/^USER\s+root$/m);
    }
    const web = readFile('docker/web.Dockerfile');
    expect(
      validateDockerfile(web.replace('CMD ["node"', 'COPY .env.local ./\nCMD ["node"')),
    ).toContain('Dockerfile : copie d’un fichier .env interdite');
    expect(validateDockerfile(web.replace('USER node', 'USER root'))).toContain(
      'Dockerfile : USER root interdit',
    );
    expect(
      validateDockerfile(web.replace('ARG GIT_COMMIT="unknown"', 'ARG SUPABASE_SERVICE_ROLE_KEY')),
    ).toContain(
      'Dockerfile : argument de build ressemblant à un secret (SUPABASE_SERVICE_ROLE_KEY)',
    );
  });

  test('.dockerignore exclut secrets, dépendances et historique Git', () => {
    const text = readFile('.dockerignore');
    expect(validateDockerignore(text)).toEqual([]);
    expect(validateDockerignore(text.replace('.env.*\n', ''))).toContain(
      '.dockerignore : motif .env.* absent',
    );
    expect(text).not.toContain('!.env');
  });

  test('le guide couvre démarrage, migrations, sauvegarde, mise à jour et arrêt', () => {
    const text = readFile('docs/operations/self-hosting.md');
    expect(validateGuide(text)).toEqual([]);
    expect(validateGuide('')).toContain('guide : section « sauvegarde » absente');
    expect(validateGuide('')).toContain('guide : section « mise à jour » absente');
    expect(text).toContain('docker/compose.selfhost.yml');
    expect(text).toContain('tools/docker/check-selfhost.mjs');
    expect(text).not.toContain('down -v');
  });

  test('les clés Supabase sont des JWT HS256 déterministes avec le bon rôle', () => {
    const issuedAt = 1_762_000_000;
    const keys = serviceKeys('un-secret-de-test', issuedAt);
    expect(serviceKeys('un-secret-de-test', issuedAt)).toEqual(keys);
    const payload = JSON.parse(
      Buffer.from(keys.anon.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as { role: string; iss: string; iat: number };
    expect(payload).toMatchObject({ role: 'anon', iss: 'supabase', iat: issuedAt });
    const service = JSON.parse(
      Buffer.from(keys.service.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as { role: string };
    expect(service.role).toBe('service_role');
    const [header, body, signature] = keys.anon.split('.');
    expect(header).toBeDefined();
    expect(body).toBeDefined();
    expect(signature).toBeDefined();
    expect(createJwt('un-secret-de-test', { role: 'anon' })).not.toBe(keys.anon);
  });
});
