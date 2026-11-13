// Serializable shapes of the SPEC-501 demonstration page (client and server).
export interface DemoBrickVersion {
  version: number;
  versionId: string;
  createdBy: 'tutor' | 'learner' | 'import';
  origin: 'resource' | 'tutor';
  createdAt: string;
  fingerprint: string | null;
}

export interface DemoBrick {
  brickId: string;
  status: 'active' | 'reported' | 'retired';
  currentVersion: number;
  versions: DemoBrickVersion[];
  publicPayload: unknown;
  publicVersionId: string;
}

export interface Spec501DemoData {
  brick: DemoBrick | null;
  error: string | null;
}
