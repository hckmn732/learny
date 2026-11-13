import type { CredentialDto } from '@learny/contracts';

/** Serializable data of the SPEC-505 demonstration (client and server). */
export interface DemoProviderOption {
  value: string;
  label: string;
  outsideEu: boolean;
  dataNote: string;
  requiresBaseUrl: boolean;
  keyOptional: boolean;
}

export interface DemoStorage {
  bytes: number;
  ivHex: string;
}

export interface Spec505DemoData {
  credentials: CredentialDto[];
  providers: DemoProviderOption[];
  storage: DemoStorage | null;
  rawJson: string;
  error: string | null;
}

export interface DemoActionState {
  error: string | null;
}
