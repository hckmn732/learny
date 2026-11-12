export type { AuthClient, AuthDeps, SignupMetadata, SignupMethod } from './client';
export { callbackUrl } from './client';
export {
  DEFAULT_DESTINATION,
  PROFILE_DELETION_DESTINATION,
  isSafeNextPath,
  onboardingDestination,
  resolvePostAuthDestination,
} from './destination';
export type { DestinationProfile } from './destination';
export { finalizeFirstVerification, loadDestinationProfile, setSignedUpEmitter } from './finalize';
export type { FinalizeResult, SignedUpEmitter, SignedUpEvent } from './finalize';
export { mapGotrueError, retryAfterFromMessage } from './gotrue-errors';
export type { GotrueErrorLike, GotrueOutcome } from './gotrue-errors';
export {
  requestMagicLink,
  resendLink,
  signInWithPassword,
  signOut,
  signUpWithPassword,
} from './requests';
export { INVALID_LINK_DESTINATION, completeVerification } from './verify';
export type { CallbackType } from './verify';
