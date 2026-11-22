// Types of artifacts.mjs for TypeScript consumers (Vitest unit tests, ADR-3015 § 2).
export interface CampaignArtifact {
  /** Flux qui a produit l'artefact, tel que l'agent l'a observé (nom ou nom de fichier). */
  flow?: string | null;
  /** Chemin relatif au répertoire de sortie de Maestro (`<flux>/takeScreenshot/x.png`). */
  path?: string;
  name: string;
}

export interface CampaignFlow {
  name: string;
  file?: string;
}

export interface FlowBucket<Artifact extends CampaignArtifact = CampaignArtifact> {
  flow: CampaignFlow;
  screenshots: Artifact[];
  videos: Artifact[];
}

export interface Attribution<Artifact extends CampaignArtifact = CampaignArtifact> {
  byFlow: Record<string, FlowBucket<Artifact>>;
  unattributed: { artifact: Artifact; reason: 'sans-flux' | 'flux-inconnu' | 'ambigu' }[];
}

export function flowSlug(value: unknown): string;
export function flowFileStem(file: unknown): string;
export function isVideoName(name: unknown): boolean;
export function attributeArtifacts<Artifact extends CampaignArtifact>(input?: {
  artifacts?: Artifact[];
  flows?: CampaignFlow[];
}): Attribution<Artifact>;
export function screenshotsForFlow<Artifact extends CampaignArtifact>(
  byFlow: Record<string, FlowBucket<Artifact>>,
  flow: CampaignFlow,
): Artifact[];
export function videosForFlow<Artifact extends CampaignArtifact>(
  byFlow: Record<string, FlowBucket<Artifact>>,
  flow: CampaignFlow,
): Artifact[];
