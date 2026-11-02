import { orchestrateGroundedContent } from "./marketing-content-orchestrator";
import {
  createMarketingAssetLibrary,
  groundedCopyAsset
} from "./marketing-asset-library";

type GenerationInput = Parameters<typeof orchestrateGroundedContent>[0];
type AssetLibrary = ReturnType<typeof createMarketingAssetLibrary>;

/** Generates real provider output, validates existing claim/tenant lineage, then
 * registers DRAFT bytes with CAS and independent read-back. No approval/publication.
 * The caller must authorize the actor/tenant and reserve a generation allowance.
 * A retry may invoke the provider again: do not automatically retry generation.
 */
export async function generateAndStoreMarketingCopy(input: {
  generation: GenerationInput;
  library: AssetLibrary;
  assetId: string;
  createdAt: string;
  operationId: string;
  expectedRevision: number;
}) {
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0
  )
    throw new Error("ASSET_REVISION_INVALID");
  // Reject stale edits before spending a provider call; register performs final atomic CAS.
  const { brain, campaign } = input.generation;
  const current = await input.library.read(
    brain.tenantId,
    campaign.id,
    input.assetId
  );
  if ((current?.record.revision ?? 0) !== input.expectedRevision)
    throw new Error("ASSET_REVISION_CONFLICT");
  const draft = await orchestrateGroundedContent(input.generation);
  const record = await input.library.register(
    groundedCopyAsset(
      draft,
      campaign.id,
      input.assetId,
      input.createdAt,
      input.operationId,
      input.expectedRevision
    )
  );
  const readBack = await input.library.read(
    brain.tenantId,
    campaign.id,
    input.assetId,
    record.revision
  );
  if (!readBack || readBack.record.sha256 !== record.sha256)
    throw new Error("ASSET_METADATA_READBACK_FAILED");
  return { draft, record: readBack.record, content: readBack.content };
}
