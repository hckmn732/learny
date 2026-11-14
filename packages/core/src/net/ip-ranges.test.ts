import { describe, expect, it } from 'vitest';

import { isBlockedIp, isBlockedIpv4, isBlockedIpv6, parseIpv4, parseIpv6 } from './ip-ranges';

describe('[SPEC-505] classification des adresses IPv4', () => {
  it('parseIpv4 refuse les formes invalides', () => {
    expect(parseIpv4('1.2.3')).toBeNull();
    expect(parseIpv4('1.2.3.a')).toBeNull();
    expect(parseIpv4('1.2.3.256')).toBeNull();
    expect(parseIpv4('93.184.216.34')).toEqual([93, 184, 216, 34]);
  });

  it('bloque une chaîne non analysable et les plages réservées', () => {
    expect(isBlockedIpv4('nope')).toBe(true);
    for (const address of [
      '10.1.2.3',
      '100.64.0.1',
      '169.254.169.254',
      '172.16.0.1',
      '192.0.0.1',
      '192.0.2.1',
      '192.88.99.1',
      '198.18.0.1',
      '198.51.100.1',
      '203.0.113.1',
      '224.0.0.1',
      '255.255.255.255',
    ]) {
      expect(isBlockedIpv4(address), address).toBe(true);
    }
    expect(isBlockedIpv4('93.184.216.34')).toBe(false);
    expect(isBlockedIpv4([8, 8, 8, 8])).toBe(false);
  });
});

describe('[SPEC-505] analyse IPv6', () => {
  it('ignore la zone, refuse le vide et les formes malformées', () => {
    expect(parseIpv6('fe80::1%eth0')).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIpv6('%eth0')).toBeNull();
    expect(parseIpv6('1.2.3.4')).toBeNull();
    expect(parseIpv6('::ffff:1.2.3')).toBeNull();
    expect(parseIpv6('1::2::3')).toBeNull();
    expect(parseIpv6('zzzz::1')).toBeNull();
    expect(parseIpv6('::zzzz')).toBeNull();
    expect(parseIpv6('1:2:3:4:5:6:7')).toBeNull();
    expect(parseIpv6('1:2:3:4:5:6:7:8:9')).toBeNull();
  });

  it('développe les formes compressées et les IPv4 incorporées', () => {
    expect(parseIpv6('2001:db8:0:0:0:0:0:1')).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]);
    expect(parseIpv6('::ffff:93.184.216.34')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x5db8, 0xd822]);
    expect(parseIpv6('2001:db8::1.2.3.4')).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0x0102, 0x0304]);
  });
});

describe('[SPEC-505] classification des adresses IPv6', () => {
  it.each([
    ['::', '::'],
    ['::1', '::1'],
    ['mappée privée', '::ffff:10.0.0.1'],
    ['compatible privée', '::7f00:1'],
    ['NAT64 privée', '64:ff9b::10.0.0.1'],
    ['NAT64 locale', '64:ff9b:0:0:1::1'],
    ['6to4 privée', '2002:0a00:0001::1'],
    ['Teredo serveur privé', '2001:0:0a00:1::1'],
    ['Teredo client privé', '2001:0:5db8:d822::f5ff:fffe'],
    ['unique local', 'fd00::1'],
    ['lien local', 'fe80::1'],
    ['site local', 'fec0::1'],
    ['multicast', 'ff02::1'],
    ['documentation', '2001:db8::1'],
    ['discard', '100::1'],
    ['ORCHID', '2001:10::1'],
    ['ORCHIDv2', '2001:20::1'],
    ['inanalysable', 'not-an-ip'],
  ])('bloque %s', (_label, address) => {
    expect(isBlockedIpv6(address)).toBe(true);
  });

  it('laisse passer les adresses publiques, y compris via les préfixes de transition', () => {
    expect(isBlockedIpv6('2606:4700::6810:84e5')).toBe(false);
    expect(isBlockedIpv6('::ffff:93.184.216.34')).toBe(false);
    expect(isBlockedIpv6('64:ff9b::93.184.216.34')).toBe(false);
    expect(isBlockedIpv6('64:ff9b:2::1')).toBe(false);
    expect(isBlockedIpv6('2002:5db8:d822::1')).toBe(false);
    expect(isBlockedIpv6('2001:0:5db8:d822::a247:27dd')).toBe(false);
  });

  it('isBlockedIp choisit la famille et bloque l’inconnu', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true);
    expect(isBlockedIp('::1')).toBe(true);
    expect(isBlockedIp('93.184.216.34')).toBe(false);
    expect(isBlockedIp('example.test')).toBe(true);
  });
});
