// Unit tests of the personal-data / idempotency / search schema (SPEC-112 §12, CA-1 to CA-3).
// They are pure: no database connection. Columns, enumerations and constraints follow
// docs/architecture/data-model.md §11–§12; the request fingerprint follows ADR-0120/ADR-0219.
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  IDEMPOTENCY_VALIDITY_MS,
  LEGAL_DOCUMENTS,
  SEARCH_QUERY_MAX_LENGTH,
  SNIPPET_MAX_LENGTH,
  canonicalJson,
  computeRequestHash,
  dataExports,
  idempotencyKeySchema,
  idempotencyKeys,
  isDataExportDownloadable,
  legalAcceptances,
  legalDocument,
  normalizeSearchQuery,
  rateLimits,
  requestHashSchema,
  sanitizeSnippet,
  searchLimitSchema,
} from './privacy-search';

function columns(table: Parameters<typeof getTableColumns>[0]): string[] {
  return Object.values(getTableColumns(table))
    .map((column) => column.name)
    .sort();
}

function indexColumnNames(index: unknown): string[] {
  if (typeof index !== 'object' || index === null) return [];
  const config = (index as { config?: unknown }).config;
  if (typeof config !== 'object' || config === null) return [];
  const values = (config as { columns?: unknown }).columns;
  if (!Array.isArray(values)) return [];
  return values.map((column) => {
    if (typeof column === 'object' && column !== null && 'name' in column) {
      const name: unknown = (column as { name?: unknown }).name;
      return typeof name === 'string' ? name : '';
    }
    return '';
  });
}

describe('[SPEC-112] privacy search schema', () => {
  it('CA-1 — les quatre tables portent les colonnes du modèle de données', () => {
    expect(columns(dataExports)).toEqual(
      ['created_at', 'expires_at', 'id', 'size_bytes', 'status', 'storage_path', 'user_id'].sort(),
    );
    expect(columns(legalAcceptances)).toEqual(
      ['accepted_at', 'document', 'id', 'user_id', 'version'].sort(),
    );
    expect(columns(idempotencyKeys)).toEqual(
      [
        'completed_at',
        'created_at',
        'key',
        'request_hash',
        'response',
        'route',
        'status_code',
        'user_id',
      ].sort(),
    );
    expect(columns(rateLimits)).toEqual(['bucket', 'tokens', 'updated_at'].sort());
    expect(LEGAL_DOCUMENTS).toEqual(['cgu', 'privacy']);
    expect(LEGAL_DOCUMENTS).toEqual(legalDocument.enumValues);
  });

  it('CA-1 — clé d’idempotence composite, empreinte et historique légal unique', () => {
    const idempotency = getTableConfig(idempotencyKeys);
    expect(idempotency.primaryKeys).toHaveLength(1);
    expect(idempotency.primaryKeys[0]?.columns.map((column) => column.name)).toEqual([
      'user_id',
      'key',
    ]);
    const checks = idempotency.checks.map((constraint) => constraint.name);
    for (const name of [
      'idempotency_keys_key_check',
      'idempotency_keys_route_check',
      'idempotency_keys_request_hash_check',
      'idempotency_keys_status_code_check',
      'idempotency_keys_completed_at_check',
    ]) {
      expect(checks, name).toContain(name);
    }
    const purge = idempotency.indexes.find(
      (index) => index.config.name === 'idempotency_keys_created_at_idx',
    );
    expect(indexColumnNames(purge)).toEqual(['created_at']);

    const legal = getTableConfig(legalAcceptances);
    expect(legal.uniqueConstraints).toHaveLength(1);
    expect(legal.uniqueConstraints[0]?.columns.map((column) => column.name)).toEqual([
      'user_id',
      'document',
      'version',
    ]);

    const exportsConfig = getTableConfig(dataExports);
    const exportChecks = exportsConfig.checks.map((constraint) => constraint.name);
    for (const name of [
      'data_exports_storage_path_check',
      'data_exports_size_bytes_check',
      'data_exports_expires_at_check',
    ]) {
      expect(exportChecks, name).toContain(name);
    }
    const expiration = exportsConfig.indexes.find(
      (index) => index.config.name === 'data_exports_expires_at_idx',
    );
    expect(expiration).toBeDefined();
    expect(expiration?.config.where).toBeDefined();
    expect(indexColumnNames(expiration)).toEqual(['expires_at']);

    const limits = getTableConfig(rateLimits);
    expect(rateLimits.bucket.primary).toBe(true);
    expect(limits.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining(['rate_limits_bucket_check', 'rate_limits_tokens_check']),
    );
  });

  it('CA-1 / CL-2 — un export n’est téléchargeable que terminé, stocké et non expiré', () => {
    const now = new Date('2026-11-11T12:20:00Z');
    const expiresAt = new Date('2026-11-18T12:20:00Z');
    const done = { status: 'done', storagePath: 'exports/alex.zip', expiresAt };
    expect(isDataExportDownloadable(done, now)).toBe(true);
    // The row survives after expiration but no URL is issued.
    expect(isDataExportDownloadable(done, new Date('2026-11-18T12:20:00.001Z'))).toBe(false);
    expect(isDataExportDownloadable(done, expiresAt)).toBe(false);
    expect(isDataExportDownloadable({ ...done, status: 'queued' }, now)).toBe(false);
    expect(isDataExportDownloadable({ ...done, status: 'failed' }, now)).toBe(false);
    expect(isDataExportDownloadable({ ...done, storagePath: null }, now)).toBe(false);
    expect(isDataExportDownloadable({ ...done, storagePath: '' }, now)).toBe(false);
    expect(isDataExportDownloadable({ ...done, expiresAt: null }, now)).toBe(false);
  });

  it('CA-2 / CL-3 — la clé et l’empreinte respectent les bornes d’ADR-0120', () => {
    expect(idempotencyKeySchema.safeParse('export-2026-11-11').success).toBe(true);
    expect(idempotencyKeySchema.safeParse('A_b-12345').success).toBe(true);
    expect(idempotencyKeySchema.safeParse('court').success).toBe(false);
    expect(idempotencyKeySchema.safeParse('x'.repeat(129)).success).toBe(false);
    expect(idempotencyKeySchema.safeParse('clé-avec-accent').success).toBe(false);
    expect(idempotencyKeySchema.safeParse('clé avec espace').success).toBe(false);

    const hash = 'a'.repeat(64);
    expect(requestHashSchema.safeParse(hash).success).toBe(true);
    expect(requestHashSchema.safeParse('A'.repeat(64)).success).toBe(false);
    expect(requestHashSchema.safeParse('a'.repeat(63)).success).toBe(false);
    expect(requestHashSchema.safeParse('a'.repeat(65)).success).toBe(false);
    expect(IDEMPOTENCY_VALIDITY_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('CA-2 — l’empreinte est stable, canonique et couvre méthode, route, paramètres et corps', () => {
    const base = {
      method: 'post',
      route: '/api/v1/formations/:id/exports',
      params: { id: 'f1', page: 2 },
      body: { title: 'Trésorerie', tags: ['b', 'a'], nested: { z: 1, a: 2 } },
    };
    const first = computeRequestHash(base);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    // Key order in objects does not change the fingerprint; case of the method does not either.
    const reordered = computeRequestHash({
      method: 'POST',
      route: base.route,
      params: { page: 2, id: 'f1' },
      body: { nested: { a: 2, z: 1 }, tags: ['b', 'a'], title: 'Trésorerie' },
    });
    expect(reordered).toBe(first);

    expect(computeRequestHash({ ...base, route: '/api/v1/other' })).not.toBe(first);
    expect(computeRequestHash({ ...base, method: 'PUT' })).not.toBe(first);
    expect(computeRequestHash({ ...base, params: { id: 'f1', page: 3 } })).not.toBe(first);
    expect(computeRequestHash({ ...base, body: { ...base.body, title: 'Budget' } })).not.toBe(
      first,
    );
    // Arrays keep their order: a different order is a different body.
    expect(computeRequestHash({ ...base, body: { ...base.body, tags: ['a', 'b'] } })).not.toBe(
      first,
    );
    expect(() => computeRequestHash({ method: '', route: base.route })).toThrow(/méthode/i);
    expect(() =>
      computeRequestHash({ method: 'POST', route: base.route, body: Number.POSITIVE_INFINITY }),
    ).toThrow();
  });

  it('CA-2 — canonicalJson trie les clés et omet les valeurs indéfinies', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
    expect(canonicalJson([3, { b: 1, a: 2 }])).toBe('[3,{"a":2,"b":1}]');
    expect(canonicalJson('texte')).toBe('"texte"');
    expect(canonicalJson(undefined)).toBe('null');
  });

  it('CA-3 / CL-5 — la requête est normalisée, trimée et bornée, la limite reste 1..100', () => {
    expect(normalizeSearchQuery('  Trésorerie   prévisionnelle  ')).toBe(
      'Trésorerie prévisionnelle',
    );
    expect(normalizeSearchQuery('l’argent\tdu\ncompte')).toBe('l’argent du compte');
    const long = 'é'.repeat(SEARCH_QUERY_MAX_LENGTH + 40);
    expect(normalizeSearchQuery(long)).toHaveLength(SEARCH_QUERY_MAX_LENGTH);
    expect(normalizeSearchQuery('   ')).toBe('');

    expect(searchLimitSchema.safeParse(1).success).toBe(true);
    expect(searchLimitSchema.safeParse(100).success).toBe(true);
    expect(searchLimitSchema.safeParse(0).success).toBe(false);
    expect(searchLimitSchema.safeParse(101).success).toBe(false);
    expect(searchLimitSchema.safeParse(2.5).success).toBe(false);
  });

  it('CA-3 / CL-8 — un extrait est du texte brut borné, jamais du HTML', () => {
    const snippet = sanitizeSnippet(
      '<p>Le cycle de <strong>trésorerie</strong> &amp; les encaissements.</p>',
    );
    expect(snippet).toBe('Le cycle de trésorerie les encaissements.');
    expect(snippet).not.toContain('<');
    expect(snippet).not.toContain('>');
    expect(snippet).not.toContain('&');
    expect(sanitizeSnippet("<script>alert('x')</script>Texte utile")).toBe(
      "alert('x') Texte utile",
    );
    expect(sanitizeSnippet('mot '.repeat(100))).toHaveLength(SNIPPET_MAX_LENGTH);
    expect(sanitizeSnippet(null)).toBe('');
    expect(sanitizeSnippet('   ')).toBe('');
    expect(sanitizeSnippet('abcdef', 3)).toBe('abc');
    expect(sanitizeSnippet('abcdef', -1)).toBe('');
  });
});
