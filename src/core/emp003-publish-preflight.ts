import type { TenantContext } from "./contracts";
import type { ControlledContent } from "./marketing-content-approval";
import { evaluateCampaignPublicationReadiness, type CampaignPublicationReadinessInput } from "./emp003-publication-readiness";

/** Read-only preflight. This function cannot invoke a provider or schedule a job. */
export function preflightEMP003ContentPublish(input: {
  context: TenantContext;
  content: ControlledContent;
  campaign: CampaignPublicationReadinessInput;
}): ReturnType<typeof evaluateCampaignPublicationReadiness> {
  const { context, content, campaign } = input;
  if (context.employeeId !== "EMP-003") return { ready: false, publishExecuted: false, reason: "EMPLOYEE_NOT_AUTHORIZED" };
  if (content.tenantId !== context.tenantId || campaign.tenantId !== context.tenantId) {
    return { ready: false, publishExecuted: false, reason: "TENANT_MISMATCH" };
  }
  return evaluateCampaignPublicationReadiness({
    ...campaign,
    contentStatus: content.status,
    approvedBy: content.approvedBy,
    approvalEvidenceRef: content.approvalEvidenceRef
  });
}
