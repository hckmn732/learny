// Shared contract of the native switch (SPEC-3002 EF-2, ET-6): each platform keeps its own
// control, the label and the accessibility state are common.
export interface SwitchProps {
  /** Announced label of the switch, e.g. « Notifications ». */
  readonly label: string;
  readonly value: boolean;
  readonly onValueChange: (value: boolean) => void;
  readonly description?: string;
  readonly disabled?: boolean;
  readonly testID?: string;
}
