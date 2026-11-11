// Shapes shared by the SPEC-005 demo (server reader and client gallery).
export interface ReferenceEntryMeta {
  screenId: string;
  state: string;
  viewport: 'desktop' | 'mobile';
  file: string;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  sha256: string;
}

export interface ReferenceState {
  key: string;
  screenId: string;
  state: string;
  desktop: ReferenceEntryMeta;
  mobile: ReferenceEntryMeta;
}
