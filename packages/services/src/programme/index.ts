// Public API of the programme services (SPEC-605, SPEC-606).
export { adjustProposal } from './adjust';
export { generateProposal, programmeLock, searchContext, tutorProfile } from './generate';
export {
  getActiveProgramme,
  getProgrammeScreenState,
  readActiveProgramme,
} from './get-active-programme';
export { getProgrammePageState, getProgrammeState } from './get';
export { decodeProgrammeImport, extractProgrammeText } from './import-file';
export { importProposal } from './import';
export {
  assertModuleAccess,
  calendarWeeks,
  formationProgress,
  lockedModuleMessage,
  programmeIndicators,
} from './progress';
export {
  incomplete,
  normalizeDraft,
  parseProposalPayload,
  totalChapters,
  totalNotions,
} from './rules';
export {
  activeFormationCount,
  buildProposalDto,
  cadrageCompleted,
  currentVersion,
  readFormation,
  readProfile,
  readProgrammeState,
  readProposal,
} from './state';
export { validateProposal } from './validate';
