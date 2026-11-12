'use client';

import { useId, useState, type SyntheticEvent } from 'react';

import { fr } from '../../messages/fr';

const t = fr.sdd.spec002;

interface RuleError {
  name: string;
  message: string;
}

interface Finding {
  line: number;
  rule: string;
  preview: string;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

const fieldClass =
  'mt-2 block w-full rounded-[8px] border border-solid border-border p-2 font-mono';
const buttonClass =
  'mt-3 rounded-[8px] bg-ink px-4 py-2 text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2';

export function CommitCheckForm() {
  const id = useId();
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ valid: boolean; errors: RuleError[] } | null>(null);
  const [failed, setFailed] = useState(false);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFailed(false);
    try {
      setResult(
        await postJson<{ valid: boolean; errors: RuleError[] }>('/api/v1/_dev/commit-check', {
          message,
        }),
      );
    } catch {
      setResult(null);
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)}>
      <label htmlFor={id}>{t.commit.label}</label>
      <textarea
        id={id}
        data-testid="commit-message"
        rows={4}
        className={fieldClass}
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
        }}
      />
      <button type="submit" data-testid="commit-check" className={buttonClass} disabled={pending}>
        {t.commit.submit}
      </button>
      <div data-testid="commit-result" aria-live="polite" className="mt-3">
        {failed ? <p>{fr.sdd.spec002.error}</p> : null}
        {result ? (
          <>
            <p className={result.valid ? 'text-green-ink' : 'text-danger'}>
              {result.valid ? t.commit.valid : t.commit.invalid}
            </p>
            {result.errors.length > 0 ? (
              <ul className="mt-2 list-disc pl-6">
                {result.errors.map((e) => (
                  <li key={e.name}>{`${e.name} : ${e.message}`}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
    </form>
  );
}

export function SecretScanForm() {
  const id = useId();
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [failed, setFailed] = useState(false);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFailed(false);
    try {
      const r = await postJson<{ findings: Finding[] }>('/api/v1/_dev/secret-scan', { text });
      setFindings(r.findings);
    } catch {
      setFindings(null);
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)}>
      <label htmlFor={id}>{t.secrets.label}</label>
      <textarea
        id={id}
        data-testid="secret-text"
        rows={4}
        className={fieldClass}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
      />
      <button type="submit" data-testid="secret-scan" className={buttonClass} disabled={pending}>
        {t.secrets.submit}
      </button>
      <div data-testid="secret-result" aria-live="polite" className="mt-3">
        {failed ? <p>{fr.sdd.spec002.error}</p> : null}
        {findings ? (
          <>
            <p>{findings.length === 0 ? t.secrets.none : t.secrets.found(findings.length)}</p>
            {findings.length > 0 ? (
              <ul className="mt-2 list-disc pl-6">
                {findings.map((f) => (
                  <li key={`${String(f.line)}-${f.rule}`}>
                    {`${t.secrets.line} ${String(f.line)} — ${f.rule} — ${f.preview}`}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
    </form>
  );
}
