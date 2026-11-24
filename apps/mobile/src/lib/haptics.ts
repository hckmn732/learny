// Light haptic feedback (SPEC-3002 EF-4). The system setting of the device decides: the
// application has no setting of its own, and a device without a haptic engine simply ignores the
// call (a failed promise, never a crash).
import * as Haptics from 'expo-haptics';

function silently(action: () => Promise<void>): void {
  try {
    void action().catch(() => undefined);
  } catch {
    // No haptic engine on this device (emulator, web build): feedback is optional.
  }
}

/** Selection feedback: a segmented control, an answer option, a switch. */
export function selectionFeedback(): void {
  silently(async () => Haptics.selectionAsync());
}

/** Confirmation feedback: the main action of a screen (a primary button). */
export function confirmationFeedback(): void {
  silently(async () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Success feedback: a correct answer in the validation quiz (SPEC-3304 EF-8). */
export function successFeedback(): void {
  silently(async () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Warning feedback: a wrong answer in the validation quiz (SPEC-3304 EF-8). */
export function warningFeedback(): void {
  silently(async () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}
