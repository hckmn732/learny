// Builds the web app (Turborepo cache) then runs Playwright from the repository root (ADR-0101).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const shell = process.platform === 'win32';

function run(args) {
  const r = spawnSync('pnpm', args, { cwd: ROOT, stdio: 'inherit', shell });
  return r.status ?? 1;
}

if (process.env.E2E_SKIP_BUILD !== '1') {
  const code = run([
    'exec',
    'turbo',
    'run',
    'build',
    '--filter=@learny/web...',
    '--output-logs=errors-only',
  ]);
  if (code !== 0) process.exit(code);
}

// Default projects: desktop and mobile (mobile only plays @mobile tests). --project=cross-browser
// expands to the Firefox and WebKit projects of the checkpoints (ADR-0101).
const args = process.argv
  .slice(2)
  .flatMap((a) =>
    a === '--project=cross-browser'
      ? ['--project=cross-browser-firefox', '--project=cross-browser-webkit']
      : [a],
  );
if (!args.some((a) => a.startsWith('--project')))
  args.push('--project=desktop', '--project=mobile');

const config = path.join('apps', 'web', 'playwright.config.ts');
process.exit(run(['exec', 'playwright', 'test', '-c', config, ...args]));
