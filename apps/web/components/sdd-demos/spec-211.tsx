'use client';

import { useState } from 'react';

import type { DevExecutionTable, EmailLine, ExportState } from '@learny/contracts';

import { ApiError, api } from '../../lib/api-client';
import { fr } from '../../messages/fr';
import { BaseCard, BaseTokenStyle } from '../sdd/base-tokens';

const t = fr.sdd.spec211;

const buttonClass =
  'rounded-[12px] bg-ink px-4 py-2 text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2';
const secondaryClass =
  'rounded-[12px] border border-solid border-border bg-white px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2';

function label(instant: string | null): string {
  if (instant === null) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(instant));
}

function sizeOf(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1000) return `${String(bytes)} o`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1).replace('.', ',')} Ko`;
  return `${(bytes / 1_000_000).toFixed(1).replace('.', ',')} Mo`;
}

function messageOf(error: unknown): string {
  return error instanceof ApiError ? `${error.code} : ${error.detail}` : String(error);
}

interface TreeNode {
  name: string;
  children: TreeNode[];
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const path of paths) {
    let level = root;
    const parts = path.split('/');
    for (const [index, part] of parts.entries()) {
      let node = level.find((candidate) => candidate.name === part);
      if (node === undefined) {
        node = { name: index === parts.length - 1 ? part : `${part}/`, children: [] };
        level.push(node);
      }
      level = node.children;
    }
  }
  return root;
}

function TreeList({ nodes }: Readonly<{ nodes: TreeNode[] }>) {
  return (
    <ul className="ml-4 list-disc text-sm">
      {nodes.map((node) => (
        <li key={`${node.name}-${String(node.children.length)}`} className="font-mono break-all">
          {node.name}
          {node.children.length > 0 ? <TreeList nodes={node.children} /> : null}
        </li>
      ))}
    </ul>
  );
}

function Emails({ items }: Readonly<{ items: EmailLine[] }>) {
  if (items.length === 0) return <p className="text-sm">{t.deletion.noEmails}</p>;
  return (
    <ul data-testid="spec-211-emails" className="grid gap-1 text-sm">
      {items.map((item, index) => (
        <li key={`${item.template}-${String(index)}`}>
          {`${item.template} → ${item.to} (${label(item.at)})`}
        </li>
      ))}
    </ul>
  );
}

function Table({ rows }: Readonly<{ rows: DevExecutionTable[] }>) {
  return (
    <table data-testid="spec-211-execution-table" className="w-full text-left text-sm">
      <thead>
        <tr>
          <th scope="col">Table</th>
          <th scope="col">Lignes restantes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.table} data-testid={`spec-211-row-${row.table}`}>
            <td className="py-1 pr-3 font-mono">{row.table}</td>
            <td data-testid={`spec-211-remaining-${row.table}`}>{row.remaining}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Spec211Demo() {
  const [exportState, setExportState] = useState<ExportState | null>(null);
  const [tree, setTree] = useState<string[]>([]);
  const [emails, setEmails] = useState<EmailLine[]>([]);
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [rows, setRows] = useState<DevExecutionTable[]>([]);
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<'export' | 'deletion' | 'execution' | null>(null);
  const [announce, setAnnounce] = useState('');

  async function runExport() {
    setBusy('export');
    try {
      const result = await api.devPersonalDataExport({});
      setExportState(result.export);
      setTree(result.tree);
      setEmails(result.emails);
      setAnnounce(t.announce.exported(result.tree.length));
    } catch (error) {
      setAnnounce(t.announce.error(messageOf(error)));
    } finally {
      setBusy(null);
    }
  }

  async function schedule() {
    setBusy('deletion');
    try {
      const result = await api.devPersonalDataDeletion({});
      setScheduledFor(result.scheduledFor);
      setEmails(result.emails);
      setAnnounce(
        result.scheduledFor === null
          ? t.announce.cancelled
          : t.announce.scheduled(label(result.scheduledFor)),
      );
    } catch (error) {
      setAnnounce(t.announce.error(messageOf(error)));
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    setBusy('deletion');
    try {
      const result = await api.devPersonalDataDeletionCancel({});
      setScheduledFor(result.scheduledFor);
      setEmails(result.emails);
      setAnnounce(t.announce.cancelled);
    } catch (error) {
      setAnnounce(t.announce.error(messageOf(error)));
    } finally {
      setBusy(null);
    }
  }

  async function execute() {
    setBusy('execution');
    try {
      const result = await api.devPersonalDataExecute({});
      setRows(result.tables);
      setAuthStatus(result.authStatus);
      setEmails(result.emails);
      setAnnounce(t.announce.executed);
    } catch (error) {
      setAnnounce(t.announce.error(messageOf(error)));
    } finally {
      setBusy(null);
    }
  }

  const status = exportState?.status ?? null;
  return (
    <>
      <BaseTokenStyle />
      <p role="status" data-testid="spec-211-announce" className="mt-4 text-sm font-semibold">
        {announce}
      </p>

      <BaseCard testId="spec-211-export" title={t.export.title}>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              void runExport();
            }}
            disabled={busy !== null}
          >
            {busy === 'export' ? t.export.running : t.export.run}
          </button>
          <span data-testid="spec-211-status" className="text-sm font-semibold">
            {status === null ? t.export.empty : t.export.statusLabels[status]}
          </span>
          {exportState !== null && exportState.status === 'done' ? (
            <a
              data-testid="spec-211-download"
              className={secondaryClass}
              href={`/api/v1/me/exports/${exportState.id}?download=1`}
            >
              {t.export.download}
            </a>
          ) : null}
        </div>
        <div className="mt-4 grid gap-1 text-sm">
          <div data-testid="spec-211-size">
            {t.export.size(sizeOf(exportState?.sizeBytes ?? null))}
          </div>
          <div data-testid="spec-211-expires">
            {exportState === null
              ? t.export.noExpiry
              : t.export.expires(label(exportState.expiresAt))}
          </div>
        </div>
        <h3 className="mt-5 font-semibold">{t.export.tree}</h3>
        <div
          data-testid="spec-211-tree"
          role="region"
          aria-label={t.export.tree}
          tabIndex={0}
          className="mt-2 max-h-96 overflow-auto"
        >
          {tree.length === 0 ? (
            <p className="text-sm">{t.export.treeEmpty}</p>
          ) : (
            <>
              <p className="mb-2 text-sm">{t.export.files(tree.length)}</p>
              <TreeList nodes={buildTree(tree)} />
            </>
          )}
        </div>
      </BaseCard>

      <BaseCard testId="spec-211-deletion" title={t.deletion.title}>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              void schedule();
            }}
            disabled={busy !== null}
          >
            {t.deletion.schedule}
          </button>
          <button
            type="button"
            className={secondaryClass}
            onClick={() => {
              void cancel();
            }}
            disabled={busy !== null}
          >
            {t.deletion.cancel}
          </button>
        </div>
        <p data-testid="spec-211-scheduled" className="mt-3 text-sm font-semibold">
          {scheduledFor === null ? t.deletion.none : t.deletion.scheduled(label(scheduledFor))}
        </p>
        <h3 className="mt-5 font-semibold">{t.deletion.emails}</h3>
        <div className="mt-2">
          <Emails items={emails} />
        </div>
      </BaseCard>

      <BaseCard testId="spec-211-execution" title={t.execution.title}>
        <p className="text-sm">{t.execution.intro}</p>
        <button
          type="button"
          className={`${buttonClass} mt-3`}
          onClick={() => {
            void execute();
          }}
          disabled={busy !== null}
        >
          {busy === 'execution' ? t.execution.running : t.execution.run}
        </button>
        <h3 className="mt-5 font-semibold">{t.execution.table}</h3>
        <div
          role="region"
          aria-label={t.execution.table}
          tabIndex={0}
          className="mt-2 overflow-x-auto"
        >
          {rows.length === 0 ? (
            <p className="text-sm">{t.execution.empty}</p>
          ) : (
            <Table rows={rows} />
          )}
        </div>
        <p data-testid="spec-211-auth-status" className="mt-3 text-sm font-semibold">
          {authStatus === null ? '—' : t.execution.auth(authStatus)}
        </p>
      </BaseCard>
    </>
  );
}
