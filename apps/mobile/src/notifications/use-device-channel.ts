// État du canal appareil pour l'écran Profil → Notifications (SPEC-3501 EF-1, CA-1 ; BR-SET-03).
//
// One hook, one registrar for the process: the switch shows the state of the platform permission and
// of the subscription, `toggle` is the only path that asks for the permission (the useful moment of
// BR-NOT-03, never the first launch) and the call to action opens the system settings when the
// learner refused it (CL-1).
import { useCallback, useEffect, useState } from 'react';

import {
  apiPushSubscriptions,
  expoDevicePushPort,
  openSystemSettings,
  prepareNotificationChannel,
} from './expo-device';
import { DevicePushRegistrar, type DeviceChannelState } from './register';

/** The registrar of the application process (one token per install, CL-3). */
export const devicePushRegistrar = new DevicePushRegistrar(expoDevicePushPort, apiPushSubscriptions);

export interface DeviceChannelView {
  readonly state: DeviceChannelState;
  readonly pending: boolean;
  readonly failed: boolean;
  readonly toggle: (value: boolean) => Promise<void>;
  readonly openSettings: () => void;
}

/** State, activation and removal of the device channel, as the settings screen needs them. */
export function useDeviceChannel(): DeviceChannelView {
  const [state, setState] = useState<DeviceChannelState>('unknown');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void prepareNotificationChannel().catch(() => undefined);
    void devicePushRegistrar
      .snapshot()
      .then((snapshot) => {
        if (alive) setState(snapshot.state);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const toggle = useCallback(async (value: boolean): Promise<void> => {
    setPending(true);
    setFailed(false);
    try {
      const snapshot = value
        ? await devicePushRegistrar.enable()
        : await devicePushRegistrar.disable();
      setState(snapshot.state);
    } catch {
      setFailed(true);
      const snapshot = await devicePushRegistrar.snapshot().catch(() => null);
      if (snapshot !== null) setState(snapshot.state);
    } finally {
      setPending(false);
    }
  }, []);

  return {
    state,
    pending,
    failed,
    toggle,
    openSettings: openSystemSettings,
  };
}
