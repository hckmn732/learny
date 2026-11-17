// Connexion de l'utilisateur de démonstration (SPEC-804 ET-1). Le mot de passe est aléatoire et
// posé par @learny/testing ; l'en-tête `Cookie` sert à Lighthouse (`settings.extraHeaders`).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export function demoCookie() {
  const out = execFileSync(
    'pnpm',
    ['exec', 'tsx', path.join('tools', 'perf', 'auth-session.mjs')],
    { cwd: ROOT, encoding: 'utf8' },
  );
  const { cookieHeader } = JSON.parse(out);
  if (typeof cookieHeader !== 'string' || cookieHeader === '') {
    throw new Error('auth.mjs : session de démonstration introuvable');
  }
  return cookieHeader;
}
