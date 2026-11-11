import { describe, expect, it } from 'vitest';

import {
  databaseResetGuard,
  LOCAL_HOSTS,
  parsePort,
  REQUIRED_EXTENSIONS,
  serviceUrls,
  STACK,
} from '../../lib.mjs';

describe('[SPEC-008] local stack guards', () => {
  it('accepte une base explicitement locale', () => {
    for (const host of ['127.0.0.1', 'localhost']) {
      const result = databaseResetGuard({
        APP_ENV: 'local',
        DATABASE_URL: `postgresql://postgres:postgres@${host}:54322/postgres`,
      });
      expect(result.ok, host).toBe(true);
      expect(LOCAL_HOSTS.has(host)).toBe(true);
    }
  });

  it('refuse une base distante avant toute mutation (CA-2, CL-5)', () => {
    const result = databaseResetGuard({
      APP_ENV: 'local',
      DATABASE_URL: 'postgresql://postgres:secret@db.example.com:5432/postgres',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('db.example.com');
    expect(result.reason).not.toContain('secret');
  });

  it('refuse la production et la préversion (ET-4)', () => {
    for (const APP_ENV of ['production', 'preview']) {
      const result = databaseResetGuard({
        APP_ENV,
        DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      });
      expect(result.ok, APP_ENV).toBe(false);
      expect(result.reason).toContain(APP_ENV);
    }
  });

  it('refuse une URL absente, invalide ou non PostgreSQL', () => {
    expect(databaseResetGuard({ APP_ENV: 'local' }).ok).toBe(false);
    expect(databaseResetGuard({ APP_ENV: 'local', DATABASE_URL: '://' }).ok).toBe(false);
    expect(
      databaseResetGuard({ APP_ENV: 'local', DATABASE_URL: 'mysql://127.0.0.1/learny' }).ok,
    ).toBe(false);
  });

  it('lit les ports et URLs depuis une seule configuration (ET-3)', () => {
    expect(parsePort(undefined, 3000)).toBe(3000);
    expect(parsePort('', 8288)).toBe(8288);
    expect(parsePort('54322', 1)).toBe(54322);
    expect(() => parsePort('0', 1)).toThrow('PORT invalide');
    expect(() => parsePort('abc', 1)).toThrow('PORT invalide');
    const urls = serviceUrls({});
    expect(urls.inngest).toBe(`http://127.0.0.1:${String(STACK.inngest)}`);
    expect(urls.mailpit).toBe(`http://127.0.0.1:${String(STACK.mailpitUi)}`);
    expect(urls.web).toBe(`http://127.0.0.1:${String(STACK.web)}`);
    expect(urls.postgres).toContain(`:${String(STACK.postgres)}`);
  });

  it('exige les quatre extensions de la base locale (CA-2)', () => {
    expect(REQUIRED_EXTENSIONS).toEqual(['vector', 'unaccent', 'pg_trgm', 'pgcrypto']);
  });
});
