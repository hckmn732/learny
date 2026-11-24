import { describe, expect, it } from 'vitest';

import {
  PUSH_DEVICE_KINDS,
  PUSH_ENDPOINT_MAX_LENGTH,
  PUSH_SUBSCRIPTION_KINDS,
  PushDeviceToken,
  PushSubscriptionBody,
  PushSubscriptionKind,
  PushSubscriptionOutput,
  PushTokenPlatform,
  PushUnsubscribeBody,
  isPublicPushEndpoint,
  pushRoutes,
} from './push';

describe('[SPEC-205] isPublicPushEndpoint', () => {
  it('accepte un point d’accès HTTPS public', () => {
    expect(isPublicPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isPublicPushEndpoint('https://push.mock.learny.test/x/success')).toBe(true);
  });

  it.each([
    ['trop long', `https://example.com/${'a'.repeat(PUSH_ENDPOINT_MAX_LENGTH)}`],
    ['espace', 'https://example.com/a b'],
    ['antislash', 'https://example.com/a\\b'],
    ['URL invalide', 'not a url'],
    ['http', 'http://example.com/a'],
    ['identifiants', 'https://user:pw@example.com/a'],
    ['localhost', 'https://localhost/a'],
    ['IPv6', 'https://[::1]/a'],
    ['IPv4', 'https://127.0.0.1/a'],
    ['sans point', 'https://intranet/a'],
    ['point final', 'https://example.com./a'],
    ['suffixe local', 'https://push.internal/a'],
    ['home.arpa', 'https://box.home.arpa/a'],
  ])('refuse %s', (_label, value) => {
    expect(isPublicPushEndpoint(value)).toBe(false);
  });
});

const WEBPUSH_BODY = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: { p256dh: 'BOr_p256dh-value', auth: 'auth_value' },
};

const APNS_TOKEN = 'a'.repeat(64);
const FCM_TOKEN = 'fcm-instance:APA91b-registration_value';

describe('[SPEC-3501] PushSubscriptionBody — discriminated union', () => {
  it('accepte le corps historique du navigateur et suppose `webpush`', () => {
    const parsed = PushSubscriptionBody.parse(WEBPUSH_BODY);
    const browser = parsed as { endpoint?: string };
    expect(parsed.kind).toBe('webpush');
    expect(browser.endpoint).toBe(WEBPUSH_BODY.endpoint);
  });

  it('accepte `webpush` explicite, avec expiration et userAgent', () => {
    const parsed = PushSubscriptionBody.parse({
      ...WEBPUSH_BODY,
      kind: 'webpush',
      expirationTime: 1_760_000_000,
      userAgent: 'Firefox 159',
    });
    expect(parsed.kind).toBe('webpush');
  });

  it('accepte un abonnement APNs avec sa plateforme', () => {
    const parsed = PushSubscriptionBody.parse({
      kind: 'apns',
      token: APNS_TOKEN,
      platform: 'ios',
      deviceName: 'iPhone de Camille',
    });
    const native = parsed as { platform?: string; deviceName?: string };
    expect(parsed.kind).toBe('apns');
    expect(native.platform).toBe('ios');
    expect(native.deviceName).toBe('iPhone de Camille');
  });

  it('accepte un abonnement FCM sans plateforme et rogne le nom de l’appareil', () => {
    const parsed = PushSubscriptionBody.parse({
      kind: 'fcm',
      token: FCM_TOKEN,
      deviceName: '  Pixel 6a  ',
    });
    const native = parsed as { platform?: string; deviceName?: string };
    expect(parsed.kind).toBe('fcm');
    expect(native.platform).toBeUndefined();
    expect(native.deviceName).toBe('Pixel 6a');
  });

  it.each([
    ['un jeton trop court', { kind: 'apns', token: 'a'.repeat(15) }],
    ['un jeton trop long', { kind: 'apns', token: 'a'.repeat(513) }],
    ['un jeton avec espace', { kind: 'fcm', token: 'fcm token with space' }],
    ['un jeton absent', { kind: 'fcm' }],
    ['une plateforme inconnue', { kind: 'apns', token: APNS_TOKEN, platform: 'windows' }],
    ['un nom d’appareil trop long', { kind: 'fcm', token: FCM_TOKEN, deviceName: 'x'.repeat(121) }],
    ['un canal inconnu', { kind: 'expo', token: FCM_TOKEN }],
    ['un corps navigateur sans clés', { endpoint: WEBPUSH_BODY.endpoint }],
    ['un endpoint non public', { ...WEBPUSH_BODY, endpoint: 'http://example.com/a' }],
    ['une clé qui n’est pas base64url', { ...WEBPUSH_BODY, keys: { p256dh: 'a+b', auth: 'c/d' } }],
  ])('refuse %s', (_label, body) => {
    expect(PushSubscriptionBody.safeParse(body).success).toBe(false);
  });
});

describe('[SPEC-3501] PushUnsubscribeBody', () => {
  it('accepte l’endpoint historique et suppose `webpush`', () => {
    const parsed = PushUnsubscribeBody.parse({ endpoint: WEBPUSH_BODY.endpoint });
    expect(parsed.kind).toBe('webpush');
  });

  it('accepte un jeton natif par canal', () => {
    expect(PushUnsubscribeBody.parse({ kind: 'apns', token: APNS_TOKEN }).kind).toBe('apns');
    expect(PushUnsubscribeBody.parse({ kind: 'fcm', token: FCM_TOKEN }).kind).toBe('fcm');
  });

  it.each([
    ['un jeton natif sans jeton', { kind: 'fcm' }],
    ['un canal inconnu', { kind: 'expo', token: FCM_TOKEN }],
    ['un endpoint vide', { kind: 'webpush', endpoint: '' }],
  ])('refuse %s', (_label, body) => {
    expect(PushUnsubscribeBody.safeParse(body).success).toBe(false);
  });
});

describe('[SPEC-3501] constantes et routes du contrat', () => {
  it('déclare les trois canaux et les deux canaux d’appareil', () => {
    expect(PUSH_SUBSCRIPTION_KINDS).toEqual(['webpush', 'apns', 'fcm']);
    expect(PUSH_DEVICE_KINDS).toEqual(['apns', 'fcm']);
    expect(PushSubscriptionKind.options).toEqual(['webpush', 'apns', 'fcm']);
    expect(PushTokenPlatform.options).toEqual(['ios', 'android']);
  });

  it('borne le jeton d’appareil entre 16 et 512 caractères', () => {
    expect(PushDeviceToken.safeParse('a'.repeat(16)).success).toBe(true);
    expect(PushDeviceToken.safeParse('a'.repeat(512)).success).toBe(true);
    expect(PushDeviceToken.safeParse('a'.repeat(15)).success).toBe(false);
  });

  it('garde les métadonnées des deux opérations', () => {
    expect(pushRoutes.pushSubscriptionsUpsert.id).toBe('pushSubscriptions.upsert');
    expect(pushRoutes.pushSubscriptionsUpsert.method).toBe('POST');
    expect(pushRoutes.pushSubscriptionsUpsert.successStatus).toBe(200);
    expect(pushRoutes.pushSubscriptionsDelete.method).toBe('DELETE');
    expect(pushRoutes.pushSubscriptionsDelete.successStatus).toBe(204);
  });

  it('valide la sortie stockée sans jamais rendre les clés', () => {
    const output = {
      id: '11111111-1111-4111-8111-111111111111',
      created: true,
      createdAt: '2026-11-11T12:20:00.000Z',
      updatedAt: '2026-11-11T12:20:00.000Z',
    };
    expect(PushSubscriptionOutput.safeParse(output).success).toBe(true);
    expect(PushSubscriptionOutput.safeParse({ ...output, created: 'oui' }).success).toBe(false);
  });
});
