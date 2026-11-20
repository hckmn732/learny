import { formationManagementRoutes } from '@learny/contracts';
import { AppError } from '@learny/core';
import type { HandlerArgs } from '@learny/http/route-handler';
import {
  archiveFormation,
  canAccessFormation,
  pauseFormation,
  resumeFormation,
  switchCurrentFormation,
} from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `formation-management` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const formationManagementImplementations = {
  formationAccessGet: async ({
    ctx,
    params,
  }: HandlerArgs<typeof formationManagementRoutes.formationAccessGet>) => {
    const access = await canAccessFormation(ctx, params.fid);
    if (!access.ok) throw access.error;
    if (!access.value) throw new AppError('NOT_FOUND', 'Formation introuvable.');
    return new Response(null, { status: 204 });
  },
  formationArchive: ({
    ctx,
    params,
    body,
  }: HandlerArgs<typeof formationManagementRoutes.formationArchive>) =>
    archiveFormation(ctx, params.fid, body),
  formationPause: ({
    ctx,
    params,
    body,
  }: HandlerArgs<typeof formationManagementRoutes.formationPause>) =>
    pauseFormation(ctx, params.fid, body),
  formationResume: ({
    ctx,
    params,
    body,
  }: HandlerArgs<typeof formationManagementRoutes.formationResume>) =>
    resumeFormation(ctx, params.fid, body),
  currentFormationUpdate: ({
    ctx,
    body,
  }: HandlerArgs<typeof formationManagementRoutes.currentFormationUpdate>) =>
    switchCurrentFormation(ctx, body),
};
