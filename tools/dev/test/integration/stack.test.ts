import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const WEB_PORT = 3300;
const DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const ENV = {
  APP_ENV: 'test',
  DATABASE_URL,
  ENABLE_SDD_PAGES: 'true',
  CLOCK_FIXED_AT: '2026-11-11T12:20:00Z',
  INNGEST_DEV: '1',
  JOBS_MODE: 'inngest',
  INNGEST_WEB_URL: `http://host.docker.internal:${String(WEB_PORT)}/api/inngest`,
  MAILPIT_URL: 'http://127.0.0.1:8025',
  // SPEC-009 CL-3: a test environment only accepts the in-memory e-mail transport; Mailpit is
  // exercised below through its SMTP port, independently of the application mode.
  EMAIL_MODE: 'memory',
  LLM_MODE: 'mock',
  STRIPE_MODE: 'mock',
};

let web: ChildProcess | null = null;

function script(name: string, ...args: string[]) {
  const result = spawnSync('node', [path.join('tools', 'dev', `${name}.mjs`), ...args], {
    cwd: ROOT,
    env: { ...process.env, ...ENV },
    encoding: 'utf8',
    timeout: 600000,
  });
  return { code: result.status ?? 1, out: `${result.stdout}${result.stderr}` };
}

async function waitFor(
  url: string,
  predicate: (response: Response) => Promise<boolean> | boolean,
  attempts = 120,
) {
  let last = 'timeout';
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (await predicate(response)) return response;
      last = `HTTP ${String(response.status)}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${url} : ${last}`);
}

async function sendSmtp(subject: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = net.connect(1025, '127.0.0.1');
    let buffer = '';
    let step = 0;
    const script = [
      'EHLO localhost',
      'MAIL FROM:<learny@learny.local>',
      'RCPT TO:<alex.perrin@exemple.fr>',
      'DATA',
      `Subject: ${subject}\r\nFrom: Learny <learny@learny.local>\r\nTo: <alex.perrin@exemple.fr>\r\n\r\n${subject}\r\n.`,
      'QUIT',
    ];
    socket.on('error', reject);
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (!/^\d{3} /m.test(buffer)) return;
      const code = Number(buffer.slice(0, 3));
      buffer = '';
      if (step === 0 && code === 220) {
        socket.write(`${script[step] ?? ''}\r\n`);
        step += 1;
        return;
      }
      if (step >= 1 && step <= 5 && (code === 250 || code === 221 || code === 354)) {
        if (step === 5) {
          socket.end();
          resolve();
          return;
        }
        socket.write(`${script[step] ?? ''}\r\n`);
        step += 1;
        return;
      }
      socket.end();
      reject(new Error(`SMTP ${String(code)} à l'étape ${String(step)}`));
    });
  });
}

describe('[SPEC-008] Docker stack', () => {
  beforeAll(async () => {
    web = spawn(
      'pnpm',
      ['--filter', '@learny/web', 'exec', 'next', 'start', '-p', String(WEB_PORT)],
      {
        cwd: ROOT,
        env: { ...process.env, ...ENV },
        stdio: 'ignore',
        detached: true,
      },
    );
    await waitFor(`http://127.0.0.1:${String(WEB_PORT)}/api/v1/health`, (response) => response.ok);
  }, 180000);

  afterAll(() => {
    if (web?.pid) {
      try {
        process.kill(-web.pid, 'SIGTERM');
      } catch {
        // already stopped
      }
    }
  });

  it('démarre, contrôle et arrête la pile réelle sans perdre les volumes (CA-1, CA-2, CA-3, CA-4)', async () => {
    const up = script('up');
    expect(up.code, up.out).toBe(0);
    expect(up.out).toContain('Pile locale prête');
    const upAgain = script('up');
    expect(upAgain.code, upAgain.out).toBe(0);

    const check = script('check');
    expect(check.code, check.out).toBe(0);
    for (const service of ['supabase', 'postgres', 'inngest', 'mailpit', 'web']) {
      expect(check.out).toContain(`${service} : ok`);
    }

    const extensions = spawnSync(
      'docker',
      [
        'exec',
        'supabase_db_learny',
        'psql',
        '-U',
        'postgres',
        '-tAc',
        'select extname from pg_extension order by extname',
      ],
      { encoding: 'utf8' },
    );
    expect(extensions.status).toBe(0);
    for (const extension of ['vector', 'unaccent', 'pg_trgm', 'pgcrypto']) {
      expect(extensions.stdout).toContain(extension);
    }

    await waitFor('http://127.0.0.1:8288/dev', async (response) => {
      const body = (await response.json()) as { functions?: { name?: string }[] };
      return body.functions?.some((fn) => fn.name === 'sdd/demo-job') ?? false;
    });

    const event = await fetch('http://127.0.0.1:8288/e/learny', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'sdd/demo-job.requested',
        data: { runId: 'spec008-integration', value: 4 },
      }),
    });
    expect(event.status).toBe(200);
    const { ids } = (await event.json()) as { ids: string[] };
    const runId = ids[0];
    if (!runId) throw new Error('événement Inngest sans identifiant');
    await waitFor(`http://127.0.0.1:8288/v1/events/${runId}/runs`, async (response) => {
      const body = (await response.json()) as { data?: { status?: string }[] };
      return body.data?.some((run) => run.status === 'Completed') ?? false;
    });

    const subject = `SPEC-008 ${randomUUID()}`;
    await sendSmtp(subject);
    await waitFor('http://127.0.0.1:8025/api/v1/messages', async (response) => {
      const body = (await response.json()) as { messages?: { Subject?: string }[] };
      return body.messages?.some((message) => message.Subject === subject) ?? false;
    });

    const reset = script('db-reset', '--yes');
    expect(reset.code, reset.out).toBe(0);
    const afterReset = spawnSync(
      'docker',
      [
        'exec',
        'supabase_db_learny',
        'psql',
        '-U',
        'postgres',
        '-tAc',
        "select extname from pg_extension where extname = 'vector'",
      ],
      { encoding: 'utf8' },
    );
    expect(afterReset.stdout).toContain('vector');

    const volumesBefore = spawnSync('docker', ['volume', 'ls', '--format', '{{.Name}}'], {
      encoding: 'utf8',
    }).stdout;
    expect(volumesBefore).toContain('learny-dev_inngest-data');
    expect(volumesBefore).toContain('learny-dev_mailpit-data');

    const down = script('down');
    expect(down.code, down.out).toBe(0);
    const volumesAfter = spawnSync('docker', ['volume', 'ls', '--format', '{{.Name}}'], {
      encoding: 'utf8',
    }).stdout;
    expect(volumesAfter).toContain('learny-dev_inngest-data');
    expect(volumesAfter).toContain('learny-dev_mailpit-data');
  }, 900_000);
});
