// iOS has no floating action button: the creation action lives in the header (ADR-3003 § 3).
// Metro resolves `Fab.android.tsx` on Android; every other platform renders nothing.
export interface FabProps {
  readonly icon: string;
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  readonly testID?: string;
}

/**
 * Absent on iOS, where the header carries the action. The props are part of the platform
 * contract: Metro loads this file only on a platform without a floating action button.
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- signature shared with Fab.android.tsx */
export function Fab(_props: FabProps) {
  return null;
}
/* eslint-enable @typescript-eslint/no-unused-vars */
