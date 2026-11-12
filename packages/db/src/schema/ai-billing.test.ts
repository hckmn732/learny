// Unit tests of the AI/billing schema and its redaction rules (SPEC-110 §12, CA-1, CA-3, CA-4).
// They are pure: no database connection. Column names and enumeration values follow
// docs/architecture/data-model.md §9 and ADR-0245.
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';

import { createCredential } from '../repositories/ai-usage';

import {
  DEFAULT_DAILY_CAP_USD,
  MIN_ENCRYPTED_KEY_BYTES,
  PUBLIC_AI_CREDENTIAL_FIELDS,
  AI_CALL_STATUSES_VALUES,
  AI_PROVIDERS_VALUES,
  AI_TASKS_VALUES,
  CREDENTIAL_STATUSES_VALUES,
  SUBSCRIPTION_STATUSES_VALUES,
  aiCalls,
  aiCredentials,
  aiTaskModels,
  costUsdSchema,
  dailyCapUsdSchema,
  isEncryptedKeyFormat,
  normalizeUsd,
  subscriptions,
  toPublicCredential,
} from './ai-billing';

function columns(table: Parameters<typeof getTableColumns>[0]): string[] {
  return Object.values(getTableColumns(table))
    .map((column) => column.name)
    .sort();
}

function checkNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table)
    .checks.map((check) => check.name)
    .sort();
}

describe('[SPEC-110] AI billing schema', () => {
  it('CA-1 — expose les cinq énumérations de data-model §9', () => {
    expect(AI_PROVIDERS_VALUES).toEqual([
      'anthropic',
      'openai',
      'mistral',
      'deepseek',
      'openai_compatible',
      'local',
    ]);
    expect(CREDENTIAL_STATUSES_VALUES).toEqual(['untested', 'qualified', 'failed']);
    expect(AI_TASKS_VALUES).toEqual(['programme', 'course', 'gaps', 'tutor', 'light']);
    expect(AI_CALL_STATUSES_VALUES).toEqual(['ok', 'error', 'refused', 'capped', 'invalid_output']);
    expect(SUBSCRIPTION_STATUSES_VALUES).toEqual([
      'none',
      'active',
      'past_due',
      'canceled',
      'incomplete',
    ]);
  });

  it('CA-1 — les quatre tables portent les colonnes du modèle de données', () => {
    expect(columns(aiCredentials)).toEqual(
      [
        'base_url',
        'created_at',
        'encrypted_key',
        'id',
        'key_last4',
        'label',
        'model_ids',
        'outside_eu',
        'provider',
        'qualified_at',
        'qualification',
        'status',
        'updated_at',
        'user_id',
      ].sort(),
    );
    expect(columns(aiTaskModels)).toEqual(['credential_id', 'model_id', 'task', 'user_id']);
    expect(columns(aiCalls)).toEqual(
      [
        'batch',
        'cache_read_tokens',
        'cache_write_tokens',
        'cost_usd',
        'created_at',
        'error_code',
        'formation_id',
        'id',
        'input_tokens',
        'latency_ms',
        'managed',
        'model',
        'output_tokens',
        'provider',
        'status',
        'task',
        'user_id',
      ].sort(),
    );
    expect(columns(subscriptions)).toEqual([
      'current_period_end',
      'daily_cap_usd',
      'status',
      'stripe_customer_id',
      'stripe_subscription_id',
      'updated_at',
      'user_id',
    ]);
  });

  it('CA-1 — aucune colonne de clé en clair, seul encrypted_key porte le secret', () => {
    const names = columns(aiCredentials);
    for (const forbidden of ['api_key', 'key', 'plaintext_key', 'raw_key', 'secret']) {
      expect(names).not.toContain(forbidden);
    }
    expect(names).toContain('encrypted_key');
    const column = getTableColumns(aiCredentials).encryptedKey;
    expect(column.name).toBe('encrypted_key');
  });

  it('ET-1 — pk(user_id, task), index (user_id, created_at) et index chronologique des clés', () => {
    const taskConfig = getTableConfig(aiTaskModels);
    expect(taskConfig.primaryKeys).toHaveLength(1);
    expect(taskConfig.primaryKeys[0]?.columns.map((column) => column.name)).toEqual([
      'user_id',
      'task',
    ]);

    const callConfig = getTableConfig(aiCalls);
    const index = callConfig.indexes.find(
      (candidate) => candidate.config.name === 'ai_calls_user_id_created_at_idx',
    );
    expect(index).toBeDefined();
    const indexColumns = index?.config.columns.map((column) =>
      'name' in column ? column.name : '',
    );
    expect(indexColumns).toEqual(['user_id', 'created_at']);

    const credentialConfig = getTableConfig(aiCredentials);
    expect(
      credentialConfig.indexes.some(
        (candidate) => candidate.config.name === 'ai_credentials_user_id_created_at_idx',
      ),
    ).toBe(true);
  });

  it('ET-1 / CL-2 — numeric(12,6), défauts non négatifs et contraintes nommées', () => {
    const callColumns = getTableColumns(aiCalls);
    const cost = callColumns.costUsd as unknown as {
      precision: number;
      scale: number;
      notNull: boolean;
      default: unknown;
    };
    expect(cost.precision).toBe(12);
    expect(cost.scale).toBe(6);
    expect(cost.notNull).toBe(true);
    expect(cost.default).toBe('0');
    expect(callColumns.inputTokens.default).toBe(0);
    expect(callColumns.latencyMs.default).toBe(0);
    expect(callColumns.batch.default).toBe(false);

    const subscriptionColumns = getTableColumns(subscriptions);
    const cap = subscriptionColumns.dailyCapUsd as unknown as {
      precision: number;
      scale: number;
      default: unknown;
    };
    expect(cap.precision).toBe(12);
    expect(cap.scale).toBe(6);
    expect(cap.default).toBe(DEFAULT_DAILY_CAP_USD);
    expect(subscriptionColumns.status.default).toBe('none');

    expect(checkNames(aiCalls)).toEqual(
      expect.arrayContaining([
        'ai_calls_cache_read_tokens_check',
        'ai_calls_cache_write_tokens_check',
        'ai_calls_cost_usd_check',
        'ai_calls_input_tokens_check',
        'ai_calls_latency_ms_check',
        'ai_calls_output_tokens_check',
      ]),
    );
    expect(checkNames(aiCredentials)).toEqual(
      expect.arrayContaining([
        'ai_credentials_encrypted_key_check',
        'ai_credentials_key_last4_check',
        'ai_credentials_key_required_check',
      ]),
    );
    expect(checkNames(subscriptions)).toEqual(
      expect.arrayContaining(['subscriptions_daily_cap_usd_check']),
    );
  });

  it('CA-1 — une clé supprimée libère la tâche par la FK on delete set null', () => {
    const credentialColumn = getTableColumns(aiTaskModels).credentialId;
    expect(credentialColumn.name).toBe('credential_id');
    expect(credentialColumn.notNull).toBe(false);
    const foreignKey = getTableConfig(aiTaskModels).foreignKeys.find((candidate) =>
      candidate.getName().includes('credential_id'),
    );
    expect(foreignKey).toBeDefined();
    expect(foreignKey?.onDelete).toBe('set null');
  });

  it('CA-3 / ET-5 — la projection publique ne sérialise jamais le chiffré', () => {
    const row = {
      provider: 'anthropic' as const,
      label: 'Clé personnelle',
      keyLast4: 'a1b2',
      status: 'qualified' as const,
      outsideEu: false,
      encryptedKey: new Uint8Array(MIN_ENCRYPTED_KEY_BYTES).fill(7),
      id: '00000000-0000-4000-8000-000000000000',
    };
    const publicRow = toPublicCredential(row);
    expect(Object.keys(publicRow).sort()).toEqual([...PUBLIC_AI_CREDENTIAL_FIELDS].sort());
    expect(publicRow).toEqual({
      provider: 'anthropic',
      label: 'Clé personnelle',
      keyLast4: 'a1b2',
      status: 'qualified',
      outsideEu: false,
    });
    const json = JSON.stringify(publicRow);
    expect(json).not.toContain('encryptedKey');
    expect(json).not.toContain('encrypted_key');
    expect(json).not.toContain('Uint8Array');
    expect(json).not.toContain('7,7,7');
  });

  it('ET-2 — le format iv‖tag‖ciphertext exige au moins 29 octets', () => {
    expect(MIN_ENCRYPTED_KEY_BYTES).toBe(29);
    expect(isEncryptedKeyFormat(new Uint8Array(29))).toBe(true);
    expect(isEncryptedKeyFormat(new Uint8Array(28))).toBe(false);
    expect(isEncryptedKeyFormat('sk-ant-api03-clear')).toBe(false);
    expect(isEncryptedKeyFormat(null)).toBe(false);
  });

  it('CA-1 / ET-2 — le repository refuse une clé brute textuelle avant toute écriture', async () => {
    const tx = {} as never;
    const base = {
      userId: '00000000-0000-4000-8000-000000000001',
      provider: 'anthropic' as const,
      label: 'Clé personnelle',
      keyLast4: 'a1b2',
      encryptedKey: new Uint8Array(MIN_ENCRYPTED_KEY_BYTES),
    };
    await expect(
      createCredential(tx, { ...base, apiKey: 'sk-ant-clear' } as never),
    ).rejects.toThrow(AppError);
    await expect(
      createCredential(tx, { ...base, rawKey: 'sk-ant-clear' } as never),
    ).rejects.toThrow(/clé brute en clair/);
    // A text value in `encryptedKey` is not a ciphertext either, and a hosted key is mandatory.
    await expect(
      createCredential(tx, { ...base, encryptedKey: 'sk-ant-clear' } as never),
    ).rejects.toThrow(AppError);
    await expect(
      createCredential(tx, { ...base, encryptedKey: null, keyLast4: null }),
    ).rejects.toThrow(/exige une clé chiffrée/);
  });

  it('CA-4 / CL-2 — un coût, un plafond ou une latence négatifs sont refusés', () => {
    expect(normalizeUsd(0)).toBe('0.000000');
    expect(normalizeUsd(1.5)).toBe('1.500000');
    expect(normalizeUsd('0.42')).toBe('0.420000');
    expect(normalizeUsd('12.345678')).toBe('12.345678');
    for (const value of [
      -1,
      '-0.000001',
      '1.1234567',
      '1234567',
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(() => normalizeUsd(value), String(value)).toThrow();
    }

    expect(costUsdSchema.parse(0.42)).toBe('0.420000');
    expect(costUsdSchema.parse('1.5')).toBe('1.500000');
    for (const value of [-0.5, '-1', 'abc', Number.NaN, Number.NEGATIVE_INFINITY]) {
      expect(costUsdSchema.safeParse(value).success, String(value)).toBe(false);
    }
    for (const value of [0, '0', -1, '-0.000001', Number.NaN]) {
      expect(dailyCapUsdSchema.safeParse(value).success, String(value)).toBe(false);
    }
    expect(dailyCapUsdSchema.parse('1.5')).toBe('1.500000');
  });
});
