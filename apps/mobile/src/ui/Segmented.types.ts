// Shared contract of the segmented control (SPEC-3002 EF-2, ET-6): the mockup draws two
// different controls, so each platform has its own skin and they share this type.
export interface SegmentedOption {
  readonly value: string;
  readonly label: string;
}

export interface SegmentedProps {
  readonly options: readonly SegmentedOption[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Announced name of the group, e.g. « Vue du programme ». */
  readonly label: string;
  readonly disabled?: boolean;
  readonly testID?: string;
}

/** `testID` of an option, stable for the flows and the component tests. */
export function segmentTestID(
  testID: string | undefined,
  option: SegmentedOption,
): string | undefined {
  return testID === undefined ? undefined : `${testID}-${option.value}`;
}
