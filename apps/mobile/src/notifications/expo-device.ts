// Adaptateur Expo Notifications du canal appareil (SPEC-3501 EF-1, EF-2, EF-7 ; ADR-3007).
//
// `expo-notifications` hands the **native** token of the platform to the application
// (`getDevicePushTokenAsync`: APNs on iOS, FCM on Android). The Expo Push service is never used, so
// no third party outside the European Union sees the content of a notification (ADR-3007 §1).
//
// The Android channel « Rappels Learny » is created here, with the high importance EF-7 asks for and
// the monochrome icon declared by `app.config.ts`; iOS keeps the default sound and no badge. In the
// foreground the system banner is not shown: the internal banner of `handlers.ts` takes over, so a
// tap and a reading of the reminder never double (EF-2).
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import { requireApiClient } from '../api/registry';

import type {
  DevicePushPort,
  DeviceToken,
  PushPermission,
  PushSubscriptionPort,
} from './register';

/** Android channel of the reminders: the identifier the FCM message targets (EF-7). */
export const ANDROID_CHANNEL_ID = 'learny-reminders';
export const ANDROID_CHANNEL_NAME = 'Rappels Learny';

/**
 * e2e builds only (ADR-3018, ADR-3402 §ET-3): the emulator has no FCM configuration, so the native
 * token is replaced by a deterministic one that the local API accepts. Never set in a real build.
 */
function simulatedToken(): boolean {
  return (process.env.EXPO_PUBLIC_SDD_PUSH_MOCK as string | undefined) === '1';
}

/** The permission of the platform, mapped to the three states of the orchestration. */
function permissionOf(status: Notifications.PermissionStatus): PushPermission {
  if (status === Notifications.PermissionStatus.GRANTED) return 'granted';
  if (status === Notifications.PermissionStatus.DENIED) return 'denied';
  return 'undetermined';
}

/** EF-7 — creates the high-importance Android channel once per process (idempotent). */
export async function prepareNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: ANDROID_CHANNEL_NAME,
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
    showBadge: false,
  });
}

/** EF-2 — at the foreground the internal banner replaces the system notification. */
export function installNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: () =>
      Promise.resolve({
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
  });
}

function platformOf(kind: string): 'ios' | 'android' {
  return kind === 'ios' ? 'ios' : 'android';
}

/** The token of the device, or `null` when the build cannot obtain one (state, never exception). */
async function deviceToken(): Promise<DeviceToken | null> {
  if (simulatedToken()) {
    return {
      kind: 'fcm',
      token: `mock-fcm-${Platform.OS}-0123456789abcdef`,
      platform: platformOf(Platform.OS),
      deviceName: Platform.OS === 'ios' ? 'Simulateur iOS' : 'Émulateur Android',
    };
  }
  try {
    const native = await Notifications.getDevicePushTokenAsync();
    const kind = native.type === 'ios' ? 'apns' : 'fcm';
    return {
      kind,
      token: String(native.data),
      platform: platformOf(native.type),
      deviceName: null,
    };
  } catch {
    // A simulator without APNs, an Android build without `google-services.json`: the channel stays
    // unsupported instead of pretending a subscription exists (CL-1).
    return null;
  }
}

/** The platform port of the registrar (permission, token). */
export const expoDevicePushPort: DevicePushPort = {
  async permission() {
    const settings = await Notifications.getPermissionsAsync();
    return permissionOf(settings.status);
  },
  async requestPermission() {
    const settings = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    return permissionOf(settings.status);
  },
  token: deviceToken,
};

/** The two API calls of the channel, through the client the process installed (SPEC-3003 EF-2). */
export const apiPushSubscriptions: PushSubscriptionPort = {
  register(body) {
    return requireApiClient().api.pushSubscriptionsUpsert({ body });
  },
  unregister(body) {
    return requireApiClient().api.pushSubscriptionsDelete({ body });
  },
};

/** CL-1 — « Autoriser dans les réglages » : the system settings of the application. */
export function openSystemSettings(): void {
  void Linking.openSettings();
}
