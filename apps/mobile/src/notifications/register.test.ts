// Vitest [SPEC-3501] — canal appareil : permission, jeton, inscription et désinscription (EF-1,
// BR-NOT-03, BR-NOT-04, CL-1, CL-3 ; CA-1).
//
// The platform and the API are ports: every state of the channel is driven here without a native
// module and without a network, and the body sent to the API is validated by the contract schema.
import { describe, expect, it, vi, type Mock } from 'vitest';

import { PushSubscriptionBody } from '@learny/contracts';

import {
  DevicePushRegistrar,
  subscriptionBodyOf,
  type DevicePushPort,
  type DeviceToken,
} from './register';

const TOKEN: DeviceToken = {
  kind: 'fcm',
  token: 'mock-fcm-android-0123456789abcdef',
  platform: 'android',
  deviceName: 'Émulateur Android',
};

function port(overrides: Partial<DevicePushPort> = {}): DevicePushPort {
  return {
    permission: () => Promise.resolve('granted'),
    requestPermission: () => Promise.resolve('granted'),
    token: () => Promise.resolve(TOKEN),
    ...overrides,
  };
}

/** The two API calls, recorded: the body of each one is what the tests assert. */
class RecordedApi {
  readonly register: Mock = vi.fn(() => Promise.resolve({ id: 'subscription-1' }));
  readonly unregister: Mock = vi.fn(() => Promise.resolve(undefined));

  bodyOf(mock: Mock): unknown {
    const calls = mock.mock.calls as unknown as [unknown][];
    return calls[0]?.[0];
  }
}

describe('[SPEC-3501] inscription de l’appareil', () => {
  it('demande la permission au moment utile puis enregistre le jeton natif (CA-1)', async () => {
    const api = new RecordedApi();
    const requestPermission = vi.fn(() => Promise.resolve('granted' as const));
    const registrar = new DevicePushRegistrar(
      port({ permission: () => Promise.resolve('undetermined'), requestPermission }),
      api,
    );

    const snapshot = await registrar.enable();

    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(snapshot.state).toBe('on');
    expect(api.register).toHaveBeenCalledTimes(1);
    const body = api.bodyOf(api.register) as Record<string, unknown>;
    expect(PushSubscriptionBody.safeParse(body).success).toBe(true);
    expect(body).toEqual({
      kind: 'fcm',
      token: TOKEN.token,
      platform: 'android',
      deviceName: 'Émulateur Android',
    });
  });

  it('ne redemande pas une permission déjà accordée (BR-NOT-02)', async () => {
    const api = new RecordedApi();
    const requestPermission = vi.fn(() => Promise.resolve('granted' as const));
    const registrar = new DevicePushRegistrar(port({ requestPermission }), api);

    await registrar.enable();

    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('reste éteint et n’inscrit rien quand la permission est refusée (CL-1)', async () => {
    const api = new RecordedApi();
    const registrar = new DevicePushRegistrar(
      port({
        permission: () => Promise.resolve('undetermined'),
        requestPermission: () => Promise.resolve('denied'),
      }),
      api,
    );

    const snapshot = await registrar.enable();

    expect(snapshot).toEqual({ state: 'denied', permission: 'denied' });
    expect(api.register).not.toHaveBeenCalled();
  });

  it('signale un appareil sans jeton natif sans prétendre l’avoir inscrit (CL-1)', async () => {
    const api = new RecordedApi();
    const registrar = new DevicePushRegistrar(port({ token: () => Promise.resolve(null) }), api);

    const snapshot = await registrar.enable();

    expect(snapshot.state).toBe('unsupported');
    expect(api.register).not.toHaveBeenCalled();
  });

  it('supprime l’abonnement quand l’interrupteur est coupé (BR-SET-03)', async () => {
    const api = new RecordedApi();
    const registrar = new DevicePushRegistrar(port(), api);
    await registrar.enable();

    const snapshot = await registrar.disable();

    expect(snapshot.state).toBe('off');
    expect(api.unregister).toHaveBeenCalledWith({ kind: 'fcm', token: TOKEN.token });
  });

  it('rafraîchit le jeton au démarrage quand la permission est accordée (EF-1)', async () => {
    const api = new RecordedApi();
    const registrar = new DevicePushRegistrar(port(), api);

    const snapshot = await registrar.sync();

    expect(snapshot.state).toBe('on');
    expect(api.register).toHaveBeenCalledTimes(1);
  });

  it('ne fait rien au démarrage quand la permission est refusée (BR-NOT-03)', async () => {
    const api = new RecordedApi();
    const registrar = new DevicePushRegistrar(
      port({ permission: () => Promise.resolve('denied') }),
      api,
    );

    const snapshot = await registrar.sync();

    expect(snapshot.state).toBe('denied');
    expect(api.register).not.toHaveBeenCalled();
    expect(api.unregister).not.toHaveBeenCalled();
  });

  it('ne fait jamais échouer un démarrage sur le réseau (ET-3)', async () => {
    const api = new RecordedApi();
    api.register.mockImplementation(() => Promise.reject(new Error('offline')));
    const registrar = new DevicePushRegistrar(port(), api);

    const snapshot = await registrar.sync();

    expect(snapshot.state).toBe('off');
  });

  it('désinscrit l’appareil à la déconnexion (EF-1)', async () => {
    const api = new RecordedApi();
    const registrar = new DevicePushRegistrar(port(), api);
    await registrar.enable();

    await registrar.signOut();

    expect(api.unregister).toHaveBeenCalledWith({ kind: 'fcm', token: TOKEN.token });
    expect(registrar.current()).toBeNull();
  });

  it('n’échoue pas à la déconnexion si l’API est injoignable (CL-2)', async () => {
    const api = new RecordedApi();
    api.unregister.mockImplementation(() => Promise.reject(new Error('offline')));
    const registrar = new DevicePushRegistrar(port(), api);
    await registrar.enable();

    await expect(registrar.signOut()).resolves.toBeUndefined();
  });

  it('décrit le corps de l’abonnement d’un appareil iOS (kind apns)', () => {
    expect(subscriptionBodyOf({ ...TOKEN, kind: 'apns', platform: 'ios', deviceName: null })).toEqual(
      { kind: 'apns', token: TOKEN.token, platform: 'ios' },
    );
    expect(
      PushSubscriptionBody.safeParse(
        subscriptionBodyOf({ ...TOKEN, kind: 'apns', platform: 'ios', deviceName: null }),
      ).success,
    ).toBe(true);
  });

  it('reflète l’état de l’abonnement dans l’instantané de l’interrupteur (CA-1)', async () => {
    const registrar = new DevicePushRegistrar(port(), new RecordedApi());

    expect((await registrar.snapshot()).state).toBe('off');
    await registrar.enable();
    expect((await registrar.snapshot()).state).toBe('on');
    await registrar.disable();
    expect((await registrar.snapshot()).state).toBe('off');
  });
});
