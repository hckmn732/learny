'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { EMAIL_TEMPLATE_KEYS, type EmailTemplateKey, type EmailTone } from '@learny/contracts';
import { colors } from '@learny/ui/tokens';

import { ApiError, api } from '../../lib/api-client';
import { qk } from '../../lib/query-keys';
import { fr } from '../../messages/fr';

import { BaseCard, BaseTokenStyle } from './base-tokens';

const t = fr.sdd.spec204;

const buttonClass =
  'rounded-[12px] bg-ink px-4 py-2 text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2';
const POLL_MS = 2000;

function describeError(error: unknown): string {
  if (error instanceof ApiError) return `${error.code} (${String(error.status)})`;
  return String(error);
}

/** `alex.perrin@example.com` → `a***@example.com`: the demo never shows a full address. */
export function maskEmail(address: string): string {
  const at = address.indexOf('@');
  if (at <= 0) return '***';
  return `${address.slice(0, 1)}***@${address.slice(at + 1)}`;
}

const timeFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function ToneSwitch({
  tone,
  onChange,
}: Readonly<{ tone: EmailTone; onChange: (tone: EmailTone) => void }>) {
  return (
    <div
      role="group"
      aria-label={t.toolbar.tone}
      className="inline-flex rounded-[12px] border border-solid border-border p-1"
    >
      {(['vous', 'tu'] as const).map((value) => {
        const active = value === tone;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            data-testid={`email-tone-${value}`}
            onClick={() => {
              onChange(value);
            }}
            className="rounded-[8px] px-3 py-1 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              backgroundColor: active ? colors.ink : 'transparent',
              color: active ? colors.white : colors.ink,
            }}
          >
            {value === 'vous' ? t.toolbar.vous : t.toolbar.tu}
          </button>
        );
      })}
    </div>
  );
}

export default function Spec204Demo() {
  const queryClient = useQueryClient();
  const selectId = useId();
  const [template, setTemplate] = useState<EmailTemplateKey>('daily_digest');
  const [tone, setTone] = useState<EmailTone>('vous');

  const preview = useQuery({
    queryKey: qk.devEmailPreview(template, tone),
    queryFn: () => api.devEmailPreview({ query: { template, tone } }),
  });
  const outbox = useQuery({
    queryKey: qk.devEmailOutbox(),
    queryFn: () => api.devEmailOutbox({}),
    refetchInterval: POLL_MS,
  });
  const send = useMutation({
    mutationFn: () =>
      api.devEmailSend({ body: { template, tone } }, { idempotencyKey: crypto.randomUUID() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.devEmailOutbox() });
    },
  });

  const data = preview.data;
  const category = data?.category;
  const headerEntries = Object.entries(data?.headers ?? {});

  return (
    <>
      <BaseTokenStyle />
      <BaseCard testId="email-toolbar" title={t.toolbar.title}>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor={selectId} className="block text-sm font-semibold">
              {t.toolbar.template}
            </label>
            <select
              id={selectId}
              data-testid="email-template"
              value={template}
              onChange={(event) => {
                setTemplate(event.target.value as EmailTemplateKey);
              }}
              className="mt-1 rounded-[12px] border border-solid border-border bg-white px-3 py-2"
            >
              {EMAIL_TEMPLATE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t.templates[key]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="block text-sm font-semibold">{t.toolbar.tone}</span>
            <div className="mt-1" data-testid="email-tone">
              <ToneSwitch tone={tone} onChange={setTone} />
            </div>
          </div>
          <span
            data-testid="email-category"
            data-category={category ?? ''}
            className="rounded-full border border-solid border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide"
          >
            {category === 'transactional'
              ? t.toolbar.categoryTransactional
              : category === 'service'
                ? t.toolbar.categoryService
                : '…'}
          </span>
          <button
            type="button"
            data-testid="email-send"
            className={buttonClass}
            disabled={send.isPending || data === undefined}
            onClick={() => {
              send.mutate();
            }}
          >
            {send.isPending ? t.toolbar.sending : t.toolbar.send}
          </button>
        </div>
        <p aria-live="polite" data-testid="email-send-status" className="mt-3 text-sm">
          {send.isError
            ? `${t.toolbar.error} ${describeError(send.error)}`
            : send.isSuccess
              ? t.toolbar.sent(send.data.transport)
              : ''}
        </p>
      </BaseCard>

      <BaseCard testId="email-preview-card" title={t.preview.title}>
        <div aria-busy={preview.isFetching}>
          {data === undefined ? (
            <p className="text-sm">{preview.isError ? describeError(preview.error) : t.loading}</p>
          ) : (
            <>
              <iframe
                title={t.preview.frame}
                data-testid="email-preview"
                sandbox=""
                srcDoc={data.html}
                className="h-[720px] w-[640px] max-w-full rounded-[16px] border border-solid border-border bg-canvas"
              />
              <dl className="mt-4 text-sm">
                <dt className="font-semibold">{t.preview.subject}</dt>
                <dd data-testid="email-subject" className="mb-3">
                  {data.subject}
                </dd>
                <dt className="font-semibold">{t.preview.headers}</dt>
                <dd data-testid="email-headers">
                  {headerEntries.length === 0 ? (
                    <span>{t.preview.none}</span>
                  ) : (
                    <ul className="list-none break-all p-0 font-mono text-xs">
                      {headerEntries.map(([name, value]) => (
                        <li key={name} data-header={name}>
                          {`${name}: ${value}`}
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </dl>
            </>
          )}
        </div>
      </BaseCard>

      <BaseCard testId="email-outbox" title={t.outbox.title}>
        <p className="mb-3 text-sm">{t.outbox.intro}</p>
        <div aria-live="polite">
          {(outbox.data?.items.length ?? 0) === 0 ? (
            <p data-testid="email-outbox-empty" className="text-sm">
              {t.outbox.empty}
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {t.outbox.columns.map((column) => (
                    <th key={column} scope="col" className="py-1 pr-3 font-semibold">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...(outbox.data?.items ?? [])].reverse().map((item, index) => (
                  <tr key={`${item.at}-${String(index)}`} data-testid="email-outbox-item">
                    <th scope="row" className="py-1 pr-3 font-normal">
                      {item.subject}
                    </th>
                    <td className="py-1 pr-3">{maskEmail(item.to)}</td>
                    <td className="py-1 pr-3">{timeFormatter.format(new Date(item.at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </BaseCard>
    </>
  );
}
