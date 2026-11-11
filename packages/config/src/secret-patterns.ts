// Built-in secret scanner, run alongside gitleaks (ADR-0103).
export const SECRET_ALLOW_MARKER = 'learny-test-only';

export interface SecretPattern {
  id: string;
  regex: RegExp;
}

export const SECRET_PATTERNS: ReadonlyArray<SecretPattern> = [
  { id: 'anthropic-key', regex: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { id: 'openai-key', regex: /sk-(?:proj-)?[A-Za-z0-9_-]{32,}/ },
  { id: 'stripe-key', regex: /(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}/ },
  { id: 'stripe-webhook', regex: /whsec_[0-9A-Za-z]{20,}/ },
  { id: 'aws-access-key', regex: /AKIA[0-9A-Z]{16}/ },
  { id: 'private-key', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: 'jwt', regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { id: 'resend-key', regex: /re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/ },
  { id: 'voyage-key', regex: /pa-[A-Za-z0-9_-]{30,}/ },
  { id: 'tavily-key', regex: /tvly-[A-Za-z0-9]{20,}/ },
  { id: 'sentry-token', regex: /sntry[su]_[A-Za-z0-9+/=_-]{20,}/ },
  {
    id: 'vercel-token',
    regex: /(?:VERCEL_TOKEN|SUPABASE_ACCESS_TOKEN)\s*[=:]\s*['"]?[A-Za-z0-9_-]{20,}/,
  },
  {
    id: 'generic-assignment',
    regex: /(?:api[_-]?key|secret|password|token)\s*[=:]\s*['"][^'"\s]{16,}['"]/i,
  },
];

export interface Finding {
  file: string;
  line: number;
  rule: string;
  preview: string;
}

export function maskSecret(value: string): string {
  return `${value.slice(0, 4)}…`;
}

export function scanText(text: string, file: string): Finding[] {
  const findings: Finding[] = [];
  text.split(/\r?\n/).forEach((content, index) => {
    if (content.includes(SECRET_ALLOW_MARKER)) return;
    for (const { id, regex } of SECRET_PATTERNS) {
      const match = regex.exec(content);
      if (match) {
        findings.push({ file, line: index + 1, rule: id, preview: maskSecret(match[0]) });
      }
    }
  });
  return findings;
}

export function isForbiddenSecretFile(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  const base = normalized.slice(normalized.lastIndexOf('/') + 1);
  if (base === '.env.example') return false;
  if (/(^|\/)\.env($|\.)/.test(normalized)) return true;
  return /\.(pem|p12|key)$/i.test(base);
}
