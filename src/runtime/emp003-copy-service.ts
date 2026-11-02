import {
  createMarketingAssetLibrary,
  groundedCopyAsset,
  MarketingAssetVersionSchema,
  type AssetMetadataStorage,
  type AssetObjectStorage
} from "../core/marketing-asset-library";
import { orchestrateGroundedContent } from "../core/marketing-content-orchestrator";
import type { GroundedContentDraft } from "../core/marketing-content";
import type { ContentGenerator } from "../core/marketing-content-orchestrator";
import {
  CopyGenerateInput,
  resolveCopyContext,
  resolveCopyGeneration,
  type CopyRequest
} from "./emp003-copy-context";

export const copyHash = async (text: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
    )
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
export type CopyLedger = {
  fingerprint: string;
  state: "STARTED" | "GENERATED" | "SUCCEEDED" | "FAILED";
  createdAt: string;
  draft?: GroundedContentDraft;
  record?: ReturnType<typeof MarketingAssetVersionSchema.parse>;
  error?: string;
  contextHash?: string;
};
export function createEMP003CopyService(deps: {
  metadata: AssetMetadataStorage;
  objects: AssetObjectStorage;
  contextJson?: string;
  generator: ContentGenerator;
  loadCampaign(
    tenantId: string,
    campaignId: string
  ): Promise<{ campaign: unknown; revision: number } | undefined>;
  canGenerate(tenantId: string, campaignId: string): Promise<boolean>;
  now?: () => Date;
  actorId?: string;
}) {
  const library = createMarketingAssetLibrary(deps.metadata, deps.objects);
  const now = deps.now ?? (() => new Date());
  const campaign = async (tenantId: string, campaignId: string) => {
    const stored = await deps.loadCampaign(tenantId, campaignId);
    if (!stored) throw new Error("COPY_CAMPAIGN_NOT_FOUND");
    return stored;
  };
  return {
    async context(tenantId: string, campaignId: string) {
      const stored = await campaign(tenantId, campaignId);
      const { context } = resolveCopyContext(deps.contextJson, tenantId);
      return {
        campaignRevision: stored.revision,
        channels: context.campaigns
          .filter(
            (x) =>
              x.campaignId === campaignId &&
              x.campaignRevision === stored.revision
          )
          .map((x) => x.channel),
        canGenerate: await deps.canGenerate(tenantId, campaignId)
      };
    },
    async list(tenantId: string, campaignId: string) {
      await campaign(tenantId, campaignId);
      return library.list(tenantId, campaignId);
    },
    async read(
      tenantId: string,
      campaignId: string,
      assetId: string,
      revision?: number
    ) {
      await campaign(tenantId, campaignId);
      return library.read(tenantId, campaignId, assetId, revision);
    },
    async status(tenantId: string, campaignId: string, operationId: string) {
      await campaign(tenantId, campaignId);
      const raw = await deps.metadata.transaction((s) =>
        s.get(`emp003:copy:${tenantId}:op:${operationId}`)
      );
      if (!raw) return undefined;
      const entry = JSON.parse(raw) as CopyLedger & { campaignId: string };
      if (entry.campaignId !== campaignId) return undefined;
      return { state: entry.state, record: entry.record, error: entry.error };
    },
    async generate(
      tenantId: string,
      raw: CopyRequest
    ): Promise<{
      state: CopyLedger["state"];
      record?: CopyLedger["record"];
      error?: string;
    }> {
      const input = CopyGenerateInput.parse(raw);
      const fingerprint = await copyHash(JSON.stringify(input));
      const key = `emp003:copy:${tenantId}:op:${input.operationId}`;
      const lockKey = `emp003:copy:${tenantId}:asset:${input.campaignId}:${input.assetId}`;
      const stored = await campaign(tenantId, input.campaignId);
      // Replay before resolving changed config/revisions: never generate again for this operation.
      const prior = await deps.metadata.transaction((s) => s.get(key));
      if (prior) {
        const receipt = JSON.parse(prior) as CopyLedger;
        if (receipt.fingerprint !== fingerprint)
          throw new Error("COPY_IDEMPOTENCY_CONFLICT");
        if (receipt.state !== "GENERATED")
          return {
            state: receipt.state,
            record: receipt.record,
            ...(receipt.error ? { error: receipt.error } : {})
          };
        return finish(receipt);
      }
      if (!(await deps.canGenerate(tenantId, input.campaignId)))
        throw new Error("COPY_CAMPAIGN_IMMUTABLE");
      const resolved = resolveCopyGeneration(
        deps.contextJson,
        tenantId,
        input,
        stored,
        deps.generator
      );
      const createdAt = now().toISOString();
      const quotaKey = `emp003:copy:${tenantId}:quota:${createdAt.slice(0, 10)}`;
      const entry: CopyLedger & {
        campaignId: string;
        actorId?: string;
        contextRevision: number;
        contextHash: string;
      } = {
        fingerprint,
        state: "STARTED",
        createdAt,
        campaignId: input.campaignId,
        actorId: deps.actorId,
        contextRevision: resolved.context.revision,
        contextHash: await copyHash(JSON.stringify(resolved.context))
      };
      const reserved = await deps.metadata.transaction(async (s) => {
        if (await s.get(key)) return false;
        if (await s.get(lockKey)) throw new Error("COPY_ASSET_IN_FLIGHT");
        const head = await s.get(
          `emp003:assets:${tenantId}:${input.campaignId}:${input.assetId}:head`
        );
        if (
          (head
            ? MarketingAssetVersionSchema.parse(JSON.parse(head)).revision
            : 0) !== input.expectedRevision
        )
          throw new Error("ASSET_REVISION_CONFLICT");
        const used = Number((await s.get(quotaKey)) ?? 0);
        if (!Number.isSafeInteger(used) || used >= resolved.context.dailyLimit)
          throw new Error("COPY_QUOTA_EXHAUSTED");
        await s.put(quotaKey, String(used + 1));
        await s.put(lockKey, input.operationId);
        await s.put(key, JSON.stringify(entry));
        return true;
      });
      if (!reserved) {
        // Another request reserved the same operation. Read its receipt instead
        // of recursively entering generation; ambiguous STARTED is never replayed.
        const current = await deps.metadata.transaction((s) => s.get(key));
        if (!current) throw new Error("COPY_OPERATION_RECEIPT_MISSING");
        const receipt = JSON.parse(current) as CopyLedger;
        if (receipt.fingerprint !== fingerprint)
          throw new Error("COPY_IDEMPOTENCY_CONFLICT");
        if (receipt.state === "GENERATED") return finish(receipt);
        return {
          state: receipt.state,
          record: receipt.record,
          ...(receipt.error ? { error: receipt.error } : {})
        };
      }
      try {
        const draft = await orchestrateGroundedContent(resolved.generation);
        entry.state = "GENERATED";
        entry.draft = draft;
        await deps.metadata.transaction((s) =>
          s.put(key, JSON.stringify(entry))
        );
      } catch {
        entry.state = "FAILED";
        entry.error = "COPY_PROVIDER_OR_OUTPUT_FAILED";
        await settle(entry);
        return { state: entry.state, error: entry.error };
      }
      return finish(entry);
      async function settle(receipt: CopyLedger) {
        await deps.metadata.transaction(async (s) => {
          await s.put(
            key,
            JSON.stringify({ ...receipt, campaignId: input.campaignId })
          );
          if ((await s.get(lockKey)) === input.operationId)
            await s.put(lockKey, "");
        });
      }
      async function finish(receipt: CopyLedger) {
        if (!receipt.draft) throw new Error("COPY_RECEIPT_INVALID");
        const authorizedContext = resolveCopyGeneration(
          deps.contextJson,
          tenantId,
          input,
          stored,
          deps.generator
        );
        if (
          receipt.contextHash !==
          (await copyHash(JSON.stringify(authorizedContext.context)))
        )
          throw new Error("COPY_CONTEXT_CHANGED");
        // Recovery must still own the asset lock. A newer operation may not be
        // overwritten by a stale GENERATED receipt after an interrupted request.
        const current = await deps.metadata.transaction(async (s) => ({
          ledger: await s.get(key),
          owner: await s.get(lockKey)
        }));
        if (!current.ledger) throw new Error("COPY_OPERATION_RECEIPT_MISSING");
        const persisted = JSON.parse(current.ledger) as CopyLedger;
        if (persisted.fingerprint !== fingerprint)
          throw new Error("COPY_IDEMPOTENCY_CONFLICT");
        if (persisted.state === "SUCCEEDED")
          return { state: persisted.state, record: persisted.record };
        if (
          persisted.state !== "GENERATED" ||
          current.owner !== input.operationId
        ) {
          // Another recovery may have completed and released this lock.
          // Return the durable success receipt, never re-register or call AI.
          const latest = await deps.metadata.transaction((s) => s.get(key));
          if (latest) {
            const completed = JSON.parse(latest) as CopyLedger;
            if (completed.fingerprint !== fingerprint)
              throw new Error("COPY_IDEMPOTENCY_CONFLICT");
            if (completed.state === "SUCCEEDED" && completed.record)
              return { state: completed.state, record: completed.record };
          }
          throw new Error("COPY_RECOVERY_RECONCILIATION_REQUIRED");
        }
        // A reviewed campaign must not gain a new asset; preserve generated bytes for recovery.
        if (!(await deps.canGenerate(tenantId, input.campaignId)))
          throw new Error("COPY_CAMPAIGN_IMMUTABLE");
        const record = await library.register(
          groundedCopyAsset(
            receipt.draft,
            input.campaignId,
            input.assetId,
            receipt.createdAt,
            input.operationId,
            input.expectedRevision
          )
        );
        const back = await library.read(
          tenantId,
          input.campaignId,
          input.assetId,
          record.revision
        );
        if (!back || back.record.sha256 !== record.sha256)
          throw new Error("COPY_READBACK_FAILED");
        receipt.state = "SUCCEEDED";
        receipt.record = record;
        await settle(receipt);
        return { state: receipt.state, record };
      }
    }
  };
}
