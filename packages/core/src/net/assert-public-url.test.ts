import { describe, expect, it } from 'vitest';

import { AppError } from '../errors';

import { assertPublicUrl, type ResolvedAddress } from './assert-public-url';
import { isBlockedIp, parseIpv4, parseIpv6 } from './ip-ranges';

const PUBLIC: ResolvedAddress = { address: '93.184.216.34', family: 4 };
const publicLookup = (): Promise<readonly ResolvedAddress[]> => Promise.resolve([PUBLIC]);
const privateLookup = (): Promise<readonly ResolvedAddress[]> =>
  Promise.resolve([{ address: '10.0.0.7', family: 4 }]);

interface Case {
  label: string;
  url: string;
  code?: 'URL_INVALID' | 'URL_BLOCKED_HOST';
  options?: Parameters<typeof assertPublicUrl>[1];
}

const CASES: readonly Case[] = [
  { label: 'https public', url: 'https://example.com/v1', options: { lookup: publicLookup } },
  { label: 'http public', url: 'http://example.com/v1', options: { lookup: publicLookup } },
  // Schemes and authority.
  { label: 'ftp refusé', url: 'ftp://example.com/file', code: 'URL_INVALID' },
  { label: 'file refusé', url: 'file:///etc/passwd', code: 'URL_INVALID' },
  { label: 'data refusé', url: 'data:text/plain,hello', code: 'URL_INVALID' },
  { label: 'identifiants refusés', url: 'https://user:secret@example.com/', code: 'URL_INVALID' },
  { label: 'port 8443 refusé', url: 'https://example.com:8443/', code: 'URL_INVALID' },
  {
    label: 'port 80 accepté',
    url: 'http://example.com:80/',
    options: { lookup: publicLookup },
  },
  { label: 'adresse > 2048', url: `https://example.com/${'a'.repeat(2048)}`, code: 'URL_INVALID' },
  // Literal IPv4 ranges.
  { label: 'localhost', url: 'https://localhost/', code: 'URL_BLOCKED_HOST' },
  { label: '127.0.0.1', url: 'https://127.0.0.1/', code: 'URL_BLOCKED_HOST' },
  { label: '10/8', url: 'https://10.1.2.3/', code: 'URL_BLOCKED_HOST' },
  { label: '172.16/12', url: 'https://172.16.1.1/', code: 'URL_BLOCKED_HOST' },
  { label: '192.168/16', url: 'https://192.168.1.1/', code: 'URL_BLOCKED_HOST' },
  { label: 'CGNAT', url: 'https://100.64.0.1/', code: 'URL_BLOCKED_HOST' },
  { label: '0.0.0.0', url: 'https://0.0.0.0/', code: 'URL_BLOCKED_HOST' },
  { label: 'métadonnées', url: 'https://169.254.169.254/v1', code: 'URL_BLOCKED_HOST' },
  { label: 'multicast', url: 'https://224.0.0.1/', code: 'URL_BLOCKED_HOST' },
  { label: 'broadcast', url: 'https://255.255.255.255/', code: 'URL_BLOCKED_HOST' },
  { label: 'documentation', url: 'https://192.0.2.10/', code: 'URL_BLOCKED_HOST' },
  // Literal IPv6 ranges.
  { label: '::1', url: 'https://[::1]/', code: 'URL_BLOCKED_HOST' },
  { label: 'fc00::/7', url: 'https://[fc00::1]/', code: 'URL_BLOCKED_HOST' },
  { label: 'fe80::/10', url: 'https://[fe80::1]/', code: 'URL_BLOCKED_HOST' },
  { label: 'ff00::/8', url: 'https://[ff02::1]/', code: 'URL_BLOCKED_HOST' },
  { label: '::ffff:127.0.0.1', url: 'https://[::ffff:127.0.0.1]/', code: 'URL_BLOCKED_HOST' },
  {
    label: '::ffff:8.8.8.8 public',
    url: 'https://[::ffff:8.8.8.8]/',
  },
  { label: '2001:db8::/32', url: 'https://[2001:db8::1]/', code: 'URL_BLOCKED_HOST' },
  { label: 'fd00:ec2::254', url: 'https://[fd00:ec2::254]/', code: 'URL_BLOCKED_HOST' },
  { label: '6to4 privé', url: 'https://[2002:0a00:0001::1]/', code: 'URL_BLOCKED_HOST' },
  { label: 'IPv6 public', url: 'https://[2606:4700:4700::1111]/' },
  // Names and DNS results.
  { label: 'nom simple refusé', url: 'https://intranet/', code: 'URL_BLOCKED_HOST' },
  { label: 'suffixe .local refusé', url: 'https://nas.local/', code: 'URL_BLOCKED_HOST' },
  { label: 'point final refusé', url: 'https://example.com./', code: 'URL_BLOCKED_HOST' },
  {
    label: 'DNS privé refusé',
    url: 'https://private.example.com/',
    code: 'URL_BLOCKED_HOST',
    options: { lookup: privateLookup },
  },
  {
    label: 'DNS mixte refusé',
    url: 'https://mixed.example.com/',
    code: 'URL_BLOCKED_HOST',
    options: {
      lookup: () =>
        Promise.resolve([
          { address: '8.8.8.8', family: 4 },
          { address: '127.0.0.1', family: 4 },
        ]),
    },
  },
  {
    label: 'DNS indisponible refusé',
    url: 'https://unresolved.example.com/',
    code: 'URL_BLOCKED_HOST',
    options: { lookup: () => Promise.reject(new Error('ENOTFOUND')) },
  },
  // Local-model exception (ADR-0159 point 7).
  {
    label: 'localhost accepté en mode local',
    url: 'http://localhost:11434/v1',
    options: { allowPrivate: true },
  },
  {
    label: 'LAN accepté en mode local',
    url: 'http://192.168.1.10:8000/v1',
    options: { allowPrivate: true },
  },
  {
    label: 'schéma refusé même en mode local',
    url: 'ftp://localhost:11434/',
    code: 'URL_INVALID',
    options: { allowPrivate: true },
  },
];

describe('[SPEC-505] contrôle d’adresse publique', () => {
  it('classe les plages IPv4 et IPv6 privées ou réservées', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true);
    expect(isBlockedIp('10.0.0.1')).toBe(true);
    expect(isBlockedIp('169.254.169.254')).toBe(true);
    expect(isBlockedIp('8.8.8.8')).toBe(false);
    expect(isBlockedIp('2606:4700:4700::1111')).toBe(false);
    expect(isBlockedIp('::ffff:10.0.0.1')).toBe(true);
    expect(isBlockedIp('pas-une-adresse')).toBe(true);
    expect(parseIpv4('192.168.0.1')).toEqual([192, 168, 0, 1]);
    expect(parseIpv4('300.0.0.1')).toBeNull();
    expect(parseIpv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIpv6('2001:db8::')).toEqual([0x2001, 0x0db8, 0, 0, 0, 0, 0, 0]);
    expect(parseIpv6('2001:db8::8.8.8.8')).toEqual([0x2001, 0x0db8, 0, 0, 0, 0, 0x0808, 0x0808]);
  });

  it.each(CASES)('$label', async ({ url, code, options }) => {
    if (code === undefined) {
      const parsed = await assertPublicUrl(url, options);
      expect(parsed).toBeInstanceOf(URL);
      return;
    }
    await expect(assertPublicUrl(url, options)).rejects.toMatchObject({ code });
  });

  it('refuse une erreur typée, jamais une exception brute', async () => {
    await expect(assertPublicUrl('https://169.254.169.254/')).rejects.toBeInstanceOf(AppError);
  });
});
