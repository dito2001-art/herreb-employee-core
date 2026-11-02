import { z } from "zod";
import type { CampaignStorage } from "./campaign-persistent";
import type { GroundedContentDraft } from "./marketing-content";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const MarketingAssetVersionSchema = z.object({
  tenantId: id,
  campaignId: id,
  assetId: id,
  revision: z.number().int().positive(),
  kind: z.enum(["COPY", "IMAGE", "GRAPHIC", "VIDEO", "EMAIL"]),
  channel: z.string().trim().min(1).max(100),
  mimeType: z.string().min(1),
  objectKey: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  // Approval is deliberately separate and must refer to this exact immutable revision/hash.
  status: z.literal("DRAFT"),
  publishExecuted: z.literal(false)
});
export type MarketingAssetVersion = z.infer<typeof MarketingAssetVersionSchema>;
export interface AssetMetadataStorage {
  transaction<T>(work: (storage: CampaignStorage) => Promise<T>): Promise<T>;
}
export interface AssetObjectStorage {
  put(key: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | undefined>;
}
const prefix = (tenantId: string, campaignId: string, assetId: string) =>
  `emp003:assets:${id.parse(tenantId)}:${id.parse(campaignId)}:${id.parse(assetId)}:`;
const digest = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes))
    )
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const mimeFor = {
  COPY: ["text/plain"],
  EMAIL: ["text/plain", "text/html"],
  IMAGE: ["image/png", "image/jpeg", "image/webp"],
  GRAPHIC: ["image/png", "image/jpeg", "image/webp"],
  VIDEO: ["video/mp4", "video/webm"]
};
function decode(
  raw: string,
  tenantId: string,
  campaignId: string,
  assetId: string
) {
  const record = MarketingAssetVersionSchema.parse(JSON.parse(raw));
  if (
    record.tenantId !== tenantId ||
    record.campaignId !== campaignId ||
    record.assetId !== assetId
  )
    throw new Error("ASSET_SCOPE_MISMATCH");
  const expected = `emp003/${tenantId}/${campaignId}/${assetId}/${record.sha256}`;
  if (record.objectKey !== expected)
    throw new Error("ASSET_OBJECT_SCOPE_MISMATCH");
  return record;
}

/** No provider, credential, route or publish capability. Callers supply real bytes.
 * Objects use content-addressed keys; failed CAS may leave an unreferenced object,
 * never overwrite an accepted revision. Metadata store MUST provide real atomic transactions.
 */
export function createMarketingAssetLibrary(
  metadata: AssetMetadataStorage,
  objects: AssetObjectStorage
) {
  return {
    async list(tenantId: string, campaignId: string) {
      const campaignPrefix = `emp003:assets:${id.parse(tenantId)}:${id.parse(campaignId)}:`;
      return metadata.transaction(async (storage) => {
        const rows = await storage.list(campaignPrefix);
        return rows
          .filter((row) => row.key.endsWith(":head"))
          .map((row) => {
            const parsed = MarketingAssetVersionSchema.parse(
              JSON.parse(row.value)
            );
            const record = decode(
              row.value,
              tenantId,
              campaignId,
              parsed.assetId
            );
            if (
              row.key !== `${prefix(tenantId, campaignId, record.assetId)}head`
            )
              throw new Error("ASSET_SCOPE_MISMATCH");
            return record;
          });
      });
    },
    async register(input: {
      tenantId: string;
      campaignId: string;
      assetId: string;
      kind: MarketingAssetVersion["kind"];
      channel: string;
      mimeType: string;
      content: Uint8Array;
      evidenceRefs: string[];
      createdAt: string;
      expectedRevision: number;
      operationId: string;
    }): Promise<MarketingAssetVersion> {
      const root = prefix(input.tenantId, input.campaignId, input.assetId);
      id.parse(input.operationId);
      if (
        !Number.isSafeInteger(input.expectedRevision) ||
        input.expectedRevision < 0
      )
        throw new Error("ASSET_REVISION_INVALID");
      if (!input.content.length || input.content.length > 25 * 1024 * 1024)
        throw new Error("ASSET_SIZE_INVALID");
      if (!mimeFor[input.kind]?.includes(input.mimeType))
        throw new Error("ASSET_MEDIA_TYPE_INVALID");
      const sha256 = await digest(input.content);
      const record = MarketingAssetVersionSchema.parse({
        tenantId: input.tenantId,
        campaignId: input.campaignId,
        assetId: input.assetId,
        revision: input.expectedRevision + 1,
        kind: input.kind,
        channel: input.channel,
        mimeType: input.mimeType,
        objectKey: `emp003/${input.tenantId}/${input.campaignId}/${input.assetId}/${sha256}`,
        sha256,
        bytes: input.content.length,
        createdAt: input.createdAt,
        evidenceRefs: input.evidenceRefs,
        status: "DRAFT",
        publishExecuted: false
      });
      const fingerprint = await digest(
        new TextEncoder().encode(JSON.stringify(record))
      );
      // Immutable object key includes a content hash. Read-back is mandatory before registration.
      await objects.put(
        record.objectKey,
        Uint8Array.from(input.content),
        input.mimeType
      );
      const readBack = await objects.get(record.objectKey);
      if (!readBack || (await digest(readBack)) !== sha256)
        throw new Error("ASSET_OBJECT_READBACK_FAILED");
      return metadata.transaction(async (storage) => {
        const operationKey = `${root}operation:${input.operationId}`;
        const prior = await storage.get(operationKey);
        if (prior) {
          const receipt = JSON.parse(prior) as {
            fingerprint: string;
            record: MarketingAssetVersion;
          };
          if (receipt.fingerprint !== fingerprint)
            throw new Error("ASSET_IDEMPOTENCY_CONFLICT");
          return decode(
            JSON.stringify(receipt.record),
            input.tenantId,
            input.campaignId,
            input.assetId
          );
        }
        const head = await storage.get(`${root}head`);
        const revision = head
          ? decode(head, input.tenantId, input.campaignId, input.assetId)
              .revision
          : 0;
        if (revision !== input.expectedRevision)
          throw new Error("ASSET_REVISION_CONFLICT");
        await storage.put(
          `${root}version:${record.revision}`,
          JSON.stringify(record)
        );
        await storage.put(`${root}head`, JSON.stringify(record));
        await storage.put(
          operationKey,
          JSON.stringify({ fingerprint, record })
        );
        return record;
      });
    },
    async read(
      tenantId: string,
      campaignId: string,
      assetId: string,
      revision?: number
    ) {
      if (
        revision !== undefined &&
        (!Number.isSafeInteger(revision) || revision < 1)
      )
        throw new Error("ASSET_REVISION_INVALID");
      const root = prefix(tenantId, campaignId, assetId);
      const record = await metadata.transaction(async (storage) => {
        const raw = await storage.get(
          `${root}${revision === undefined ? "head" : `version:${revision}`}`
        );
        return raw ? decode(raw, tenantId, campaignId, assetId) : undefined;
      });
      if (!record) return undefined;
      const content = await objects.get(record.objectKey);
      if (!content || (await digest(content)) !== record.sha256)
        throw new Error("ASSET_OBJECT_READBACK_FAILED");
      return { record, content };
    }
  };
}

/** Bridge from the existing grounded-copy generator, preserving its evidence lineage. */
export function groundedCopyAsset(
  draft: GroundedContentDraft,
  campaignId: string,
  assetId: string,
  createdAt: string,
  operationId: string,
  expectedRevision = 0
) {
  if (
    draft.status !== "DRAFT" ||
    !draft.claimIds.length ||
    !draft.sourceKnowledgeIds.length
  )
    throw new Error("ASSET_VERIFIED_COPY_REQUIRED");
  if (!draft.headline.trim() || !draft.body.trim())
    throw new Error("ASSET_COPY_EMPTY");
  return {
    tenantId: draft.tenantId,
    campaignId,
    assetId,
    kind: "COPY" as const,
    channel: draft.channel,
    mimeType: "text/plain",
    content: new TextEncoder().encode(`${draft.headline}\n\n${draft.body}`),
    evidenceRefs: draft.sourceKnowledgeIds.map((id) => `knowledge:${id}`),
    createdAt,
    operationId,
    expectedRevision
  };
}
