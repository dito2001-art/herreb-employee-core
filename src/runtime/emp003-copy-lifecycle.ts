import { z } from "zod";
import {
  createMarketingAssetLibrary,
  MarketingAssetVersionSchema,
  type AssetMetadataStorage,
  type AssetObjectStorage
} from "../core/marketing-asset-library";
import {
  CopyId,
  CopyGenerateInput,
  resolveCopyContext,
  resolveCopyGeneration
} from "./emp003-copy-context";
import { copyHash } from "./emp003-copy-service";
import {
  CopyEditInput,
  CopyApproveInput,
  CopyApprovalSchema
} from "../core/emp003-copy-lifecycle-contracts";
export {
  CopyEditInput,
  CopyApproveInput,
  CopyApprovalSchema
} from "../core/emp003-copy-lifecycle-contracts";
export const brandHeadKey = (tenantId: string) =>
  `emp003:brand:${CopyId.parse(tenantId)}:head`;
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b))
        )
      : v
  );
export async function configuredCopyHash(raw: string | undefined, t: string) {
  return copyHash(canonical(resolveCopyContext(raw, t).context));
}
const noModel = {
  async generate(): Promise<never> {
    throw Error("COPY_MANUAL_MODEL_FORBIDDEN");
  }
};
/** Uses only deployment-owned context, existing immutable library, and atomic DO metadata.
 * Manual content remains unverified DRAFT. An explicit owner attestation approves exact bytes,
 * never promotes text from a brief into authoritative knowledge or claims.
 */
export function createEMP003CopyLifecycle(deps: {
  metadata: AssetMetadataStorage;
  objects: AssetObjectStorage;
  contextJson?: string;
  loadCampaign(
    t: string,
    c: string
  ): Promise<{ campaign: unknown; revision: number } | undefined>;
  actorId?: string;
  now?: () => Date;
}) {
  const library = createMarketingAssetLibrary(deps.metadata, deps.objects);
  async function profile(t: string) {
    const { context, brain } = resolveCopyContext(deps.contextJson, t);
    return { context, brain, hash: await copyHash(canonical(context)) };
  }
  async function pinProfile(t: string) {
    const p = await profile(t);
    await deps.metadata.transaction(async (s) => {
      const headRaw = await s.get(brandHeadKey(t));
      const head = headRaw
        ? (JSON.parse(headRaw) as { revision: number; hash: string })
        : undefined;
      if (
        head &&
        (p.context.revision < head.revision ||
          (p.context.revision === head.revision && p.hash !== head.hash))
      )
        throw Error("COPY_BRAND_REVISION_CONFLICT");
      const key = `emp003:brand:${t}:version:${p.context.revision}`;
      const prior = await s.get(key);
      if (prior && JSON.parse(prior).hash !== p.hash)
        throw Error("COPY_BRAND_REVISION_CONFLICT");
      if (!prior)
        await s.put(key, JSON.stringify({ hash: p.hash, context: p.context }));
      if (!head || head.revision < p.context.revision)
        await s.put(
          brandHeadKey(t),
          JSON.stringify({ revision: p.context.revision, hash: p.hash })
        );
    });
    return p;
  }
  async function brand(t: string, revision?: number) {
    let p = await profile(t);
    const head = await deps.metadata.transaction((s) => s.get(brandHeadKey(t)));
    if (head) {
      const h = JSON.parse(head);
      if (
        p.context.revision < h.revision ||
        (p.context.revision === h.revision && p.hash !== h.hash)
      )
        throw Error("COPY_BRAND_REVISION_CONFLICT");
    }
    if (revision !== undefined && revision !== p.context.revision) {
      const raw = await deps.metadata.transaction((s) =>
        s.get(`emp003:brand:${t}:version:${revision}`)
      );
      if (!raw) throw Error("COPY_BRAND_NOT_FOUND");
      const saved = JSON.parse(raw);
      const resolved = resolveCopyContext(JSON.stringify([saved.context]), t);
      p = { ...resolved, hash: await copyHash(canonical(resolved.context)) };
      if (p.hash !== saved.hash) throw Error("COPY_BRAND_READBACK_FAILED");
    }
    return {
      tenantId: t,
      revision: p.context.revision,
      hash: p.hash,
      brand: p.context.brand,
      claims: p.brain.publishableClaims.map((c) => ({
        id: c.id,
        text: c.text,
        sourceKnowledgeIds: c.sourceKnowledgeIds
      })),
      restrictions: p.context.brand.prohibitedThemes,
      source: "SERVER_CONFIGURATION" as const,
      editable: false,
      publicationEnabled: false
    };
  }
  async function campaign(t: string, c: string) {
    const stored = await deps.loadCampaign(t, c);
    if (!stored) throw Error("COPY_CAMPAIGN_NOT_FOUND");
    return stored;
  }
  async function authorize(
    t: string,
    input: z.infer<typeof CopyApproveInput> | z.infer<typeof CopyEditInput>,
    channel: string
  ) {
    const p = await pinProfile(t);
    if (
      input.contextRevision !== p.context.revision ||
      input.contextHash !== p.hash
    )
      throw Error("COPY_BRAND_REVISION_CONFLICT");
    const stored = await campaign(t, input.campaignId);
    const resolved = resolveCopyGeneration(
      deps.contextJson,
      t,
      CopyGenerateInput.parse({
        campaignId: input.campaignId,
        assetId: input.assetId,
        operationId: input.operationId,
        expectedRevision: 0,
        campaignRevision: input.campaignRevision,
        channel
      }),
      stored,
      noModel
    );
    return { p, resolved };
  }
  const lockKey = (t: string, c: string, a: string) =>
    `emp003:copy:${t}:asset:${c}:${a}`;
  return {
    pinProfile,
    brand,
    async edit(t: string, raw: unknown) {
      const input = CopyEditInput.parse(raw);
      if (!deps.actorId) throw Error("COPY_ACTOR_REQUIRED");
      await campaign(t, input.campaignId);
      const fingerprint = await copyHash(
        canonical({ ...input, actorId: deps.actorId })
      );
      const key = `emp003:copy-edits:${t}:op:${input.operationId}`;
      const root = `emp003:assets:${t}:${input.campaignId}:${input.assetId}:`;
      const lock = lockKey(t, input.campaignId, input.assetId);
      const operationId = `manual_${await copyHash(input.operationId)}`;
      const acceptedKey = `${root}operation:${operationId}`;
      type Receipt = {
        fingerprint: string;
        createdAt: string;
        campaignId: string;
        state: "STARTED" | "SUCCEEDED" | "FAILED";
        record?: unknown;
        error?: string;
      };
      async function receipt() {
        const raw = await deps.metadata.transaction((s) => s.get(key));
        const r = raw ? (JSON.parse(raw) as Receipt) : undefined;
        if (
          r &&
          (r.fingerprint !== fingerprint || r.campaignId !== input.campaignId)
        )
          throw Error("COPY_IDEMPOTENCY_CONFLICT");
        return r;
      }
      async function finish(recordRaw: unknown) {
        const record = MarketingAssetVersionSchema.parse(recordRaw);
        if (
          record.tenantId !== t ||
          record.campaignId !== input.campaignId ||
          record.assetId !== input.assetId ||
          record.revision !== input.expectedRevision + 1 ||
          record.sha256 !== (await copyHash(input.text))
        )
          throw Error("COPY_RECOVERY_RECORD_CONFLICT");
        const checked = await library.read(
          t,
          input.campaignId,
          input.assetId,
          record.revision
        );
        if (!checked || checked.record.sha256 !== record.sha256)
          throw Error("ASSET_OBJECT_READBACK_FAILED");
        await deps.metadata.transaction(async (s) => {
          const current = JSON.parse((await s.get(key))!) as Receipt;
          if (current.fingerprint !== fingerprint)
            throw Error("COPY_IDEMPOTENCY_CONFLICT");
          if (current.state === "SUCCEEDED") return;
          if (
            current.state !== "STARTED" ||
            (await s.get(lock)) !== input.operationId
          )
            throw Error("COPY_RECOVERY_LOCK_CONFLICT");
          await s.put(
            key,
            JSON.stringify({ ...current, state: "SUCCEEDED", record })
          );
          await s.put(
            `emp003:asset-provenance:${t}:${input.campaignId}:${input.assetId}:${record.revision}`,
            JSON.stringify({
              kind: "MANUAL_EDIT",
              actorId: deps.actorId,
              baseRevision: input.expectedRevision,
              baseSha256: input.baseSha256,
              contextRevision: input.contextRevision,
              contextHash: input.contextHash,
              campaignRevision: input.campaignRevision,
              claimsVerified: false
            })
          );
          await s.put(lock, "");
        });
        return { record, readBackConfirmed: true };
      }
      const prior = await receipt();
      if (prior?.state === "FAILED")
        throw Error(prior.error ?? "COPY_EDIT_FAILED");
      if (prior?.state === "SUCCEEDED") return finish(prior.record);
      if (prior) {
        const accepted = await deps.metadata.transaction((s) =>
          s.get(acceptedKey)
        );
        if (accepted) return finish(JSON.parse(accepted).record);
      }
      try {
        const source = await library.read(
          t,
          input.campaignId,
          input.assetId,
          input.expectedRevision
        );
        if (!source) throw Error("COPY_ASSET_NOT_FOUND");
        if (
          source.record.kind !== "COPY" ||
          source.record.sha256 !== input.baseSha256
        )
          throw Error("ASSET_REVISION_CONFLICT");
        const { resolved } = await authorize(t, input, source.record.channel);
        const allowedKnowledge = new Set(
          resolved.generation.brain.publishableClaims
            .filter(
              (c) =>
                !c.offeringId || c.offeringId === resolved.generation.offeringId
            )
            .flatMap((c) => c.sourceKnowledgeIds)
            .map((k) => `knowledge:${k}`)
        );
        if (
          source.record.evidenceRefs.some((ref) => !allowedKnowledge.has(ref))
        )
          throw Error("COPY_VERIFIED_KNOWLEDGE_REQUIRED");
        const reserved = await deps.metadata.transaction(async (s) => {
          const old = await s.get(key);
          if (old) {
            const r = JSON.parse(old) as Receipt;
            if (r.fingerprint !== fingerprint)
              throw Error("COPY_IDEMPOTENCY_CONFLICT");
            if (r.state === "FAILED")
              throw Error(r.error ?? "COPY_EDIT_FAILED");
            return r;
          }
          if (await s.get(lock)) throw Error("COPY_ASSET_IN_FLIGHT");
          const head = await s.get(`${root}head`);
          if (
            !head ||
            MarketingAssetVersionSchema.parse(JSON.parse(head)).revision !==
              input.expectedRevision
          )
            throw Error("ASSET_REVISION_CONFLICT");
          const r: Receipt = {
            fingerprint,
            createdAt: (deps.now?.() ?? new Date()).toISOString(),
            state: "STARTED",
            campaignId: input.campaignId
          };
          await s.put(lock, input.operationId);
          await s.put(key, JSON.stringify(r));
          return r;
        });
        if (reserved.state === "SUCCEEDED") return finish(reserved.record);
        const record = await library.register({
          ...source.record,
          content: new TextEncoder().encode(input.text),
          createdAt: reserved.createdAt,
          expectedRevision: input.expectedRevision,
          operationId
        });
        return await finish(record);
      } catch (error) {
        const code = error instanceof Error ? error.message : "";
        if (
          [
            "COPY_BRAND_REVISION_CONFLICT",
            "COPY_CAMPAIGN_REVISION_CONFLICT",
            "COPY_CAMPAIGN_IMMUTABLE",
            "ASSET_REVISION_CONFLICT",
            "COPY_CAMPAIGN_CONTEXT_REQUIRED",
            "COPY_CAMPAIGN_CONTEXT_MISMATCH",
            "COPY_VERIFIED_KNOWLEDGE_REQUIRED"
          ].includes(code)
        ) {
          await deps.metadata.transaction(async (s) => {
            const raw = await s.get(key);
            if (!raw || (await s.get(acceptedKey))) return;
            const r = JSON.parse(raw) as Receipt;
            if (
              r.state === "STARTED" &&
              r.fingerprint === fingerprint &&
              (await s.get(lock)) === input.operationId
            ) {
              await s.put(
                key,
                JSON.stringify({ ...r, state: "FAILED", error: code })
              );
              await s.put(lock, "");
            }
          });
        }
        throw error;
      }
    },
    async approve(t: string, raw: unknown) {
      const input = CopyApproveInput.parse(raw);
      if (!deps.actorId) throw Error("COPY_ACTOR_REQUIRED");
      const read = await library.read(
        t,
        input.campaignId,
        input.assetId,
        input.revision
      );
      if (!read) throw Error("COPY_ASSET_NOT_FOUND");
      if (read.record.sha256 !== input.sha256)
        throw Error("ASSET_REVISION_CONFLICT");
      const { resolved } = await authorize(t, input, read.record.channel);
      const claimIds = resolved.generation.brain.publishableClaims
        .filter(
          (c) =>
            !c.offeringId || c.offeringId === resolved.generation.offeringId
        )
        .map((c) => c.id);
      if (!claimIds.length) throw Error("COPY_VERIFIED_KNOWLEDGE_REQUIRED");
      const fingerprint = await copyHash(
        canonical({ ...input, actorId: deps.actorId })
      );
      return deps.metadata.transaction(async (s) => {
        const op = `emp003:asset-approval-ops:${t}:${input.operationId}`;
        const prior = await s.get(op);
        if (prior) {
          const p = JSON.parse(prior);
          if (p.fingerprint !== fingerprint)
            throw Error("COPY_IDEMPOTENCY_CONFLICT");
          return CopyApprovalSchema.parse(p.approval);
        }
        if (await s.get(lockKey(t, input.campaignId, input.assetId)))
          throw Error("COPY_ASSET_IN_FLIGHT");
        const head = JSON.parse(
          (await s.get(
            `emp003:assets:${t}:${input.campaignId}:${input.assetId}:head`
          )) ?? "null"
        );
        if (
          !head ||
          head.revision !== input.revision ||
          head.sha256 !== input.sha256
        )
          throw Error("ASSET_REVISION_CONFLICT");
        const approval = CopyApprovalSchema.parse({
          tenantId: t,
          campaignId: input.campaignId,
          assetId: input.assetId,
          revision: input.revision,
          sha256: input.sha256,
          campaignRevision: input.campaignRevision,
          contextRevision: input.contextRevision,
          contextHash: input.contextHash,
          claimIds,
          approvedBy: deps.actorId,
          approvedAt: (deps.now?.() ?? new Date()).toISOString(),
          status: "APPROVED",
          publishExecuted: false
        });
        const key = `emp003:asset-approvals:${t}:${input.campaignId}:${input.assetId}:${input.revision}:${input.sha256}:${input.contextHash}:${input.campaignRevision}`;
        const existing = await s.get(key);
        const accepted = existing
          ? CopyApprovalSchema.parse(JSON.parse(existing))
          : approval;
        await s.put(key, JSON.stringify(accepted));
        await s.put(op, JSON.stringify({ fingerprint, approval: accepted }));
        return accepted;
      });
    },
    async approval(t: string, c: string, a: string, revision: number) {
      const stored = await campaign(t, c);
      const p = await profile(t);
      const read = await library.read(t, c, a, revision);
      if (!read) throw Error("COPY_ASSET_NOT_FOUND");
      return deps.metadata.transaction(async (s) => {
        const raw = await s.get(
          `emp003:asset-approvals:${t}:${c}:${a}:${revision}:${read.record.sha256}:${p.hash}:${stored.revision}`
        );
        const head = JSON.parse(
          (await s.get(`emp003:assets:${t}:${c}:${a}:head`)) ?? "null"
        );
        const currentBrand = JSON.parse(
          (await s.get(brandHeadKey(t))) ?? "null"
        );
        const approval = raw
          ? CopyApprovalSchema.parse(JSON.parse(raw))
          : undefined;
        return {
          approval: approval ?? null,
          active:
            !!approval &&
            head?.revision === revision &&
            head?.sha256 === read.record.sha256 &&
            (!currentBrand || currentBrand.hash === p.hash),
          publicationEnabled: false
        };
      });
    }
  };
}
