import { z } from "zod";
import {
  EMP003CampaignOperationsResponseSchema,
  buildEMP003ReviewCards
} from "./emp003-campaign-review-ui-model";

const WorkspaceResponse = EMP003CampaignOperationsResponseSchema.extend({
  permissions: z.object({ canWrite: z.boolean() })
});
/** Calendar is a projection of persisted campaign dates, never a publication queue. */
export function buildEMP003Workspace(raw: unknown) {
  const data = WorkspaceResponse.parse(raw);
  const cards = buildEMP003ReviewCards(data, data.tenantId);
  return {
    tenantId: data.tenantId,
    canWrite: data.permissions.canWrite,
    counts: {
      campaigns: cards.length,
      inReview: cards.filter((c) => c.reviewState === "IN_REVIEW").length,
      approved: cards.filter((c) => c.reviewState === "APPROVED").length
    },
    calendar: data.campaigns
      .flatMap((c) =>
        c.blueprint.schedule
          ? [
              {
                campaignId: c.campaignId,
                name: c.blueprint.name ?? c.blueprint.objective,
                startDate: c.blueprint.schedule.startDate,
                endDate: c.blueprint.schedule.endDate,
                state: c.reviewState
              }
            ]
          : []
      )
      .sort(
        (a, b) =>
          a.startDate.localeCompare(b.startDate) ||
          a.campaignId.localeCompare(b.campaignId)
      ),
    unscheduled: data.campaigns.filter((c) => !c.blueprint.schedule).length
  };
}
export type EMP003WorkspaceView = ReturnType<typeof buildEMP003Workspace>;
