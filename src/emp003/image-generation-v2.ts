/**
 * EMP-003 V2 image generation contract.
 * Isolated candidate: no provider credentials, deployments or production routes.
 * A caller must supply an authenticated, server-resolved tenant context and a
 * provider implementation. Never trust tenantId or brand claims from a prompt.
 */
export type ImageAspectRatio = "1:1" | "4:5" | "9:16" | "16:9";
export type ImageMimeType = "image/png" | "image/jpeg" | "image/webp";

export interface ImageGenerationRequest {
  campaignId: string;
  prompt: string;
  aspectRatio: ImageAspectRatio;
  operationId: string;
  brandProfileRevision: string;
  referenceAssetId?: string;
}

export interface ImageGenerationContext {
  /** Resolved from verified server identity, not request JSON. */
  tenantId: string;
  actorId: string;
  canGenerate: boolean;
}

export interface ImageGenerationProvider {
  generate(input: {
    prompt: string;
    aspectRatio: ImageAspectRatio;
    reference?: { bytes: Uint8Array; mimeType: ImageMimeType };
  }): Promise<{ bytes: Uint8Array; mimeType: ImageMimeType }>;
}

export interface ImageAssetStore {
  /** Must enforce tenant ownership and return an approved reference only. */
  readReference(tenantId: string, assetId: string): Promise<
    { bytes: Uint8Array; mimeType: ImageMimeType } | null
  >;
  /**
   * Implementations MUST atomically reserve tenantId + operationId, store
   * immutable bytes, and return the original result on an identical retry.
   * A retry with different requestHash MUST fail with a conflict.
   * Persist status DRAFT; never publish or mark approved here.
   */
  commitDraft(input: {
    tenantId: string;
    actorId: string;
    campaignId: string;
    operationId: string;
    requestHash: string;
    brandProfileRevision: string;
    bytes: Uint8Array;
    mimeType: ImageMimeType;
    sha256: string;
  }): Promise<{ assetId: string; revision: number; sha256: string; status: "DRAFT" }>;
  /** Read the immutable stored bytes independently after commit. */
  readContent(tenantId: string, assetId: string, revision: number): Promise<Uint8Array | null>;
}

export class ImageGenerationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ImageGenerationError";
  }
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
async function digest(bytes: Uint8Array): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}
function assertId(value: string, label: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)) {
    throw new ImageGenerationError("INVALID_INPUT", `Invalid ${label}`);
  }
}
function isValidImage(bytes: Uint8Array, mime: ImageMimeType): boolean {
  if (mime === "image/png") return bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
  if (mime === "image/jpeg") return bytes.length >= 4 && bytes[0]===255 && bytes[1]===216 && bytes[bytes.length-2]===255 && bytes[bytes.length-1]===217;
  return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4))==="RIFF" && String.fromCharCode(...bytes.slice(8,12))==="WEBP";
}

export async function generateImageDraft(
  ctx: ImageGenerationContext,
  request: ImageGenerationRequest,
  provider: ImageGenerationProvider,
  store: ImageAssetStore,
): Promise<{ assetId: string; revision: number; sha256: string; status: "DRAFT" }> {
  if (!ctx.canGenerate || !ctx.tenantId || !ctx.actorId) {
    throw new ImageGenerationError("FORBIDDEN", "Image generation not permitted");
  }
  assertId(ctx.tenantId, "tenantId");
  assertId(ctx.actorId, "actorId");
  assertId(request.campaignId, "campaignId");
  assertId(request.operationId, "operationId");
  assertId(request.brandProfileRevision, "brandProfileRevision");
  if (request.referenceAssetId) assertId(request.referenceAssetId, "referenceAssetId");
  if (!request.prompt.trim() || request.prompt.length > 4000 ||
      !["1:1","4:5","9:16","16:9"].includes(request.aspectRatio)) {
    throw new ImageGenerationError("INVALID_INPUT", "Invalid prompt or aspect ratio");
  }

  const canonical = JSON.stringify({
    tenantId: ctx.tenantId,
    campaignId: request.campaignId,
    operationId: request.operationId,
    prompt: request.prompt,
    aspectRatio: request.aspectRatio,
    brandProfileRevision: request.brandProfileRevision,
    referenceAssetId: request.referenceAssetId ?? null,
  });
  const requestHash = await digest(encoder.encode(canonical));
  const reference = request.referenceAssetId
    ? await store.readReference(ctx.tenantId, request.referenceAssetId)
    : undefined;
  if (request.referenceAssetId && !reference) {
    throw new ImageGenerationError("REFERENCE_NOT_FOUND", "Reference unavailable for tenant");
  }
  const output = await provider.generate({
    prompt: request.prompt,
    aspectRatio: request.aspectRatio,
    ...(reference ? { reference } : {}),
  });
  if (!["image/png","image/jpeg","image/webp"].includes(output.mimeType) ||
      output.bytes.length === 0 || output.bytes.length > MAX_IMAGE_BYTES ||
      !isValidImage(output.bytes, output.mimeType)) {
    throw new ImageGenerationError("INVALID_PROVIDER_OUTPUT", "Invalid image response");
  }
  const sha256 = await digest(output.bytes);
  const committed = await store.commitDraft({
    tenantId: ctx.tenantId, actorId: ctx.actorId,
    campaignId: request.campaignId, operationId: request.operationId,
    requestHash, brandProfileRevision: request.brandProfileRevision,
    bytes: output.bytes, mimeType: output.mimeType, sha256,
  });
  const saved = await store.readContent(ctx.tenantId, committed.assetId, committed.revision);
  if (!saved || await digest(saved) !== committed.sha256) {
    throw new ImageGenerationError("READBACK_FAILED", "Stored image integrity check failed");
  }
  return committed;
}
