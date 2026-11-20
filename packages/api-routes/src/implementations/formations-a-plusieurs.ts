import {
  formationGroupCreate,
  formationGroupGet,
  groupLeave,
  groupMemberRemove,
  groupRotateCode,
  invitationAccept,
  invitationGet,
} from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import {
  acceptInvitation,
  createFormationGroup,
  getFormationGroup,
  getInvitationPreview,
  leaveFormationGroup,
  removeMemberFromGroup,
  rotateGroupCode,
} from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `formations-a-plusieurs` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const formationsAPlusieursImplementations = {
  formationGroupGet: ({ ctx, params }: HandlerArgs<typeof formationGroupGet>) =>
    getFormationGroup(ctx, params.fid),
  formationGroupCreate: ({ ctx, params }: HandlerArgs<typeof formationGroupCreate>) =>
    createFormationGroup(ctx, params.fid),
  groupLeave: ({ ctx, params }: HandlerArgs<typeof groupLeave>) =>
    leaveFormationGroup(ctx, params.gid),
  groupMemberRemove: ({ ctx, params }: HandlerArgs<typeof groupMemberRemove>) =>
    removeMemberFromGroup(ctx, params.gid, params.uid),
  groupRotateCode: ({ ctx, params }: HandlerArgs<typeof groupRotateCode>) =>
    rotateGroupCode(ctx, params.gid),
  invitationAccept: ({ ctx, params }: HandlerArgs<typeof invitationAccept>) =>
    acceptInvitation(ctx, params.code),
  invitationGet: ({ ctx, params }: HandlerArgs<typeof invitationGet>) =>
    getInvitationPreview(ctx, params.code),
};
