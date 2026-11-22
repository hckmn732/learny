// Default entry of the segmented control, resolved by Metro to `.ios.tsx` or `.android.tsx` on a
// device. TypeScript and a test that does not set a platform resolve this file (iOS skin); the
// Jest run uses the Android skin (jest-expo/android, ADR-3004 § 6).
export { Segmented } from './Segmented.ios';
export type { SegmentedOption, SegmentedProps } from './Segmented.types';
