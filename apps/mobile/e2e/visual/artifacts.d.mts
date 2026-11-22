// Types of artifacts.mjs for TypeScript consumers (Vitest unit tests).
export interface ArtifactLike {
  name: string;
  flow?: string;
}

export interface FlowLike {
  name: string;
  base: string;
}

export interface FlowEntry<Artifact extends ArtifactLike = ArtifactLike> {
  base: string;
  name: string;
  screenshots: Artifact[];
  videos: Artifact[];
}

export function associateArtifacts<Artifact extends ArtifactLike>(
  artifacts: readonly Artifact[],
  flows: readonly FlowLike[],
): { entries: Map<string, FlowEntry<Artifact>>; unassigned: Artifact[] };

export function pickCapture<Artifact extends ArtifactLike>(
  entry: FlowEntry<Artifact> | undefined,
): Artifact | null;
