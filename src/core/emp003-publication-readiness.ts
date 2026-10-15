import type { CampaignTransition } from "./marketing-campaign-lifecycle";

/** Approval of a campaign plan never grants permission to publish content. */
export interface CampaignPublicationReadinessInput {
  tenantId: string;
  campaignTenantId: string;
  reviewState: { state: CampaignTransition["to"]; publishExecuted: boolean };
  contentStatus: "DRAFT" | "APPROVED" | "PUBLISH_READY";
  approvedBy?: string;
  approvalEvidenceRef?: string;
  channelAuthorized: boolean;
  executionPolicyAuthorized: boolean;
}

export type CampaignPublicationReadiness =
  | { ready: true; publishExecuted: false }
  | { ready: false; publishExecuted: false; reason: string };

export function evaluateCampaignPublicationReadiness(input: CampaignPublicationReadinessInput): CampaignPublicationReadiness {
  const reject = (reason: string): CampaignPublicationReadiness => ({ ready: false, publishExecuted: false, reason });
  if (!input.tenantId.trim() || input.tenantId !== input.campaignTenantId) return reject("TENANT_MISMATCH");
  if (input.reviewState.publishExecuted !== false) return reject("CAMPAIGN_ALREADY_PUBLISHED");
  if (input.reviewState.state !== "APPROVED") return reject("CAMPAIGN_NOT_APPROVED");
  if (input.contentStatus !== "PUBLISH_READY" || !input.approvedBy?.trim() || !input.approvalEvidenceRef?.trim()) return reject("CONTENT_APPROVAL_REQUIRED");
  if (!input.channelAuthorized) return reject("CHANNEL_NOT_AUTHORIZED");
  if (!input.executionPolicyAuthorized) return reject("EXECUTION_NOT_AUTHORIZED");
  return { ready: true, publishExecuted: false };
}
