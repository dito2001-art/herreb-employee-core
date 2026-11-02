import { z } from "zod";
import { MarketingAssetVersionSchema } from "./marketing-asset-library";
import { BrandProfileSchema } from "./marketing";
const CopyId = MarketingAssetVersionSchema.shape.tenantId;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const exact = {
  campaignId: CopyId,
  assetId: CopyId,
  operationId: CopyId,
  campaignRevision: z.number().int().positive(),
  contextRevision: z.number().int().positive(),
  contextHash: hash
};
export const CopyEditInput = z
  .object({
    ...exact,
    expectedRevision: z.number().int().positive(),
    baseSha256: hash,
    text: z
      .string()
      .min(1)
      .max(12000)
      .refine((x) => x.trim().length > 0)
  })
  .strict();
export const CopyApproveInput = z
  .object({
    ...exact,
    revision: z.number().int().positive(),
    sha256: hash,
    claimsReviewed: z.literal(true)
  })
  .strict();
export const CopyApprovalSchema = z
  .object({
    tenantId: CopyId,
    campaignId: CopyId,
    assetId: CopyId,
    revision: z.number().int().positive(),
    sha256: hash,
    campaignRevision: z.number().int().positive(),
    contextRevision: z.number().int().positive(),
    contextHash: hash,
    claimIds: z.array(CopyId).min(1),
    approvedBy: z.string().min(1),
    approvedAt: z.iso.datetime(),
    status: z.literal("APPROVED"),
    publishExecuted: z.literal(false)
  })
  .strict();

export const CopyBrandViewSchema = z.object({
  tenantId: CopyId,
  revision: z.number().int().positive(),
  hash,
  brand: BrandProfileSchema,
  claims: z
    .array(
      z.object({
        id: CopyId,
        text: z.string().min(1),
        sourceKnowledgeIds: z.array(CopyId).min(1)
      })
    )
    .min(1),
  restrictions: z.array(z.string()),
  source: z.literal("SERVER_CONFIGURATION"),
  editable: z.literal(false),
  publicationEnabled: z.literal(false)
});
