// Canal appareil du mobile (SPEC-3501 EF-1 ; BR-NOT-03, BR-NOT-04, CL-1).
//
// The device channel is the mobile form of the browser channel: the application asks for the system
// permission **at the useful moment** (activation of the channel or a first scheduled session, never
// at first launch), obtains the native token of the platform (APNs on iOS, FCM on Android, ADR-3007)
// and registers it under its `kind`. The token is a credential of the device: it travels only to the
// API, never into a log or a cache of the query client.
//
// This module is the pure orchestration: the platform (permission, token) and the API are ports, so
// the Vitest suite drives every state without a native module. The Expo adapter lives in
// `expo-device.ts` and the React surface in `use-device-channel.ts`.
import type { PushDeviceKind } from '@learny/contracts';

export type { PushDeviceKind };

/** The three states of the system permission the application may observe. */
export type PushPermission = 'granted' | 'denied' | 'undetermined';

/** State of the device channel, as the settings switch shows it (BR-SET-03). */
export type DeviceChannelState = 'unknown' | 'off' | 'on' | 'denied' | 'unsupported';

/** The device token of one platform, with the label the settings page keeps. */
export interface DeviceToken {
  readonly kind: PushDeviceKind;
  readonly token: string;
  readonly platform: 'ios' | 'android';
  readonly deviceName: string | null;
}

/** What the orchestration needs from the platform (Expo Notifications in the application). */
export interface DevicePushPort {
  /** Reads the permission without asking for it (never a system dialog). */
  permission(): Promise<PushPermission>;
  /** Asks for the permission: only from the activation of the channel (BR-NOT-03, CL-1). */
  requestPermission(): Promise<PushPermission>;
  /**
   * The native token, or `null` when the platform cannot hand one (no APNs entitlement on a
   * simulator, no FCM configuration in the build). A refusal is a state, never an exception.
   */
  token(): Promise<DeviceToken | null>;
}

/** The two operations of `POST`/`DELETE /me/push-subscriptions` the channel needs. */
export interface PushSubscriptionPort {
  register(body: {
    readonly kind: PushDeviceKind;
    readonly token: string;
    readonly platform: 'ios' | 'android';
    readonly deviceName?: string;
  }): Promise<unknown>;
  unregister(body: { readonly kind: PushDeviceKind; readonly token: string }): Promise<unknown>;
}

/** State and permission together: the switch and the call to action read both (CA-1, CL-1). */
export interface DeviceChannelSnapshot {
  readonly state: DeviceChannelState;
  readonly permission: PushPermission;
}

/** The body sent to the API for one device: the token replaces the endpoint and the keys. */
export function subscriptionBodyOf(token: DeviceToken): {
  kind: PushDeviceKind;
  token: string;
  platform: 'ios' | 'android';
  deviceName?: string;
} {
  return {
    kind: token.kind,
    token: token.token,
    platform: token.platform,
    ...(token.deviceName === null ? {} : { deviceName: token.deviceName }),
  };
}

/**
 * Activation, refresh and removal of the device channel.
 *
 * One instance per application process: `enable` is the only path that asks for the permission,
 * `sync` runs at start-up (the token of a reinstalled application is refreshed there, EF-1) and
 * `signOut` removes the subscription of the device (EF-1, BR-SPA-04).
 */
export class DevicePushRegistrar {
  private registered: DeviceToken | null = null;

  constructor(
    private readonly port: DevicePushPort,
    private readonly subscriptions: PushSubscriptionPort,
  ) {}

  /** The state the switch reflects, refreshed from the platform (no request, no write). */
  async snapshot(): Promise<DeviceChannelSnapshot> {
    const permission = await this.port.permission();
    if (permission === 'denied') return { state: 'denied', permission };
    if (permission !== 'granted') return { state: 'off', permission };
    return { state: this.registered === null ? 'off' : 'on', permission };
  }

  /** CL-1, CA-1 — the useful moment: permission, token, then the subscription of the device. */
  async enable(): Promise<DeviceChannelSnapshot> {
    let permission = await this.port.permission();
    if (permission === 'undetermined') permission = await this.port.requestPermission();
    if (permission !== 'granted') {
      return { state: permission === 'denied' ? 'denied' : 'off', permission };
    }
    const token = await this.port.token();
    if (token === null) return { state: 'unsupported', permission };
    await this.subscriptions.register(subscriptionBodyOf(token));
    this.registered = token;
    return { state: 'on', permission };
  }

  /** BR-SET-03 — switching the channel off removes the subscription of the device. */
  async disable(): Promise<DeviceChannelSnapshot> {
    const token = this.registered ?? (await this.port.token());
    if (token !== null) {
      await this.subscriptions.unregister({ kind: token.kind, token: token.token });
    }
    this.registered = null;
    return { state: 'off', permission: await this.port.permission() };
  }

  /**
   * EF-1 — at every start-up, when the permission is granted, the token is registered again so a
   * rotated token replaces the previous row (CL-3). Never throws: a start-up must not fail on the
   * network, and the next launch retries.
   */
  async sync(): Promise<DeviceChannelSnapshot> {
    const permission = await this.port.permission();
    if (permission === 'denied') return { state: 'denied', permission };
    if (permission !== 'granted') return { state: 'off', permission };
    let token: DeviceToken | null = null;
    try {
      token = await this.port.token();
      if (token === null) return { state: 'unsupported', permission };
      await this.subscriptions.register(subscriptionBodyOf(token));
      this.registered = token;
      return { state: 'on', permission };
    } catch {
      this.registered = null;
      return { state: 'off', permission };
    }
  }

  /** EF-1 — the sign-out removes the subscription of the device before the session cache is wiped. */
  async signOut(): Promise<void> {
    const token = this.registered ?? (await this.port.token());
    this.registered = null;
    if (token === null) return;
    try {
      await this.subscriptions.unregister({ kind: token.kind, token: token.token });
    } catch {
      // A device that cannot reach the API keeps its row; the first failed delivery cleans it
      // (CL-2, ADR-0055). A sign-out never fails because of the push channel.
    }
  }

  /** The token currently registered in this process, for the tests and the banner. */
  current(): DeviceToken | null {
    return this.registered;
  }
}
