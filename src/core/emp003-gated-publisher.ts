import type { TenantContext } from "./contracts";
import type { ControlledWriteAuthorization, ExecutionResult } from "./executor";
import type { ControlledContent } from "./marketing-content-approval";
import { executeControlledContentPublish, type ContentPublisher, type ContentPublishReceipt } from "./marketing-content-publisher";
import type { CampaignPublicationReadinessInput } from "./emp003-publication-readiness";
import { preflightEMP003ContentPublish } from "./emp003-publish-preflight";

/**
 * Opt-in executor boundary. No route is registered here. Denials must not reach
 * the provider, even when a controlled-write token is otherwise valid.
 */
export async function executeEMP003GatedContentPublish(input: {
  context: TenantContext;
  content: ControlledContent;
  campaign: CampaignPublicationReadinessInput;
  idempotencyKey: string;
  authorization?: ControlledWriteAuthorization;
  publisher: ContentPublisher;
}): Promise<{ attempted: false; reason: string } | { attempted: true; result: ExecutionResult<ContentPublishReceipt> }> {
  const preflight = preflightEMP003ContentPublish(input);
  if (!preflight.ready) return { attempted: false, reason: preflight.reason };
  if (!input.idempotencyKey.trim()) return { attempted: false, reason: "IDEMPOTENCY_KEY_REQUIRED" };
  if (!input.authorization?.authorized || input.authorization.tenantId !== input.context.tenantId) {
    return { attempted: false, reason: "CONTROLLED_WRITE_AUTHORIZATION_REQUIRED" };
  }
  const result = await executeControlledContentPublish(input);
  return { attempted: true, result };
}
