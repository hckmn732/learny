import { brickCorrect, brickReport } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import { correctBrick, reportBrick } from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `bricks` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const bricksImplementations = {
  brickReport: async ({ ctx, params, body }: HandlerArgs<typeof brickReport>) => {
    const result = await reportBrick(ctx, params.bid, body);
    if (!result.ok) return result;
    const { reportId, status, created } = result.value;
    return Response.json({ reportId, status }, { status: created ? 201 : 200 });
  },
  brickCorrect: async ({ ctx, params, body }: HandlerArgs<typeof brickCorrect>) => {
    const result = await correctBrick(ctx, params.bid, body);
    if (!result.ok) return result;
    const { brickId, version, versionId } = result.value;
    return { brickId, version, versionId };
  },
};
