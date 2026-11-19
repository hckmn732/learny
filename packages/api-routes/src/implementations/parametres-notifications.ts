import { meNotificationSettingsGet, meNotificationSettingsUpdate } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import { getNotificationSettings, updateNotificationSettings } from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `parametres-notifications` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const parametresNotificationsImplementations = {
  meNotificationSettingsGet: ({ ctx }: HandlerArgs<typeof meNotificationSettingsGet>) =>
    getNotificationSettings(ctx),
  meNotificationSettingsUpdate: ({ ctx, body }: HandlerArgs<typeof meNotificationSettingsUpdate>) =>
    updateNotificationSettings(ctx, body),
};
