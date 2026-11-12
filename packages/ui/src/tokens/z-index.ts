// Stacking order of the application (SPEC-303, ET-2). One scale for header, overlays and dialogs.
export const zIndex = {
  header: 30,
  popover: 40,
  drawer: 45,
  dialog: 50,
  toast: 60,
  skip: 100,
} as const;

export type ZIndexToken = keyof typeof zIndex;
