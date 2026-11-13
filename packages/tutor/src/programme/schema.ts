import { ProgrammeDraftSchema, type ProgrammeDraft } from '@learny/contracts';

// Structured output of the programme task (SPEC-605 ET-3, ET-4). The schema lives in
// `@learny/contracts`; the tutor package only binds it to the model session so the service and
// the fixtures share the exact same contract.

export const PROGRAMME_DRAFT_SCHEMA = ProgrammeDraftSchema;
export const PROGRAMME_MAX_CORRECTIONS = 2;

export type ProgrammeDraftOutput = ProgrammeDraft;
