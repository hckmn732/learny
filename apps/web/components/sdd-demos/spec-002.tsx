import { spawnSync } from 'node:child_process';

import { COMMIT_TYPES } from '@learny/config';

import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

import { CommitCheckForm, SecretScanForm } from './spec-002-forms';

const t = fr.sdd.spec002;

const HOOKS = [
  { hook: 'pre-commit', command: t.hooks.preCommit },
  { hook: 'commit-msg', command: t.hooks.commitMsg },
  { hook: 'pre-push', command: t.hooks.prePush },
] as const;

function readHooksPath(): string | null {
  const r = spawnSync('git', ['config', 'core.hooksPath'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  return r.stdout.trim() || null;
}

export default function Spec002Demo() {
  const hooksPath = readHooksPath();

  return (
    <>
      <DemoSection testId="spec-002-hooks" title={t.hooks.title}>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th scope="col" className="py-2 pr-4">
                {t.hooks.hookHeader}
              </th>
              <th scope="col" className="py-2">
                {t.hooks.commandHeader}
              </th>
            </tr>
          </thead>
          <tbody>
            {HOOKS.map((h) => (
              <tr key={h.hook}>
                <td className="py-2 pr-4 font-mono">{h.hook}</td>
                <td className="py-2 font-mono">{h.command}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p data-testid="spec-002-hooks-path" className="mt-4 font-mono">
          {hooksPath === null
            ? t.hooks.hooksPathUnavailable
            : `${t.hooks.hooksPath} = ${hooksPath}`}
        </p>
      </DemoSection>
      <DemoSection testId="spec-002-commit" title={t.commit.title}>
        <CommitCheckForm />
      </DemoSection>
      <DemoSection testId="spec-002-secrets" title={t.secrets.title}>
        <SecretScanForm />
      </DemoSection>
      <DemoSection testId="spec-002-types" title={t.types.title}>
        <p className="font-mono">{COMMIT_TYPES.join(', ')}</p>
        <p className="mt-2 font-mono">{t.types.scopes}</p>
      </DemoSection>
    </>
  );
}
