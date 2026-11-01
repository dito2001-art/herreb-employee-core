import { createEMP003DurableStorageAdapter } from "./emp003-durable-storage";
import type {
  AssetMetadataStorage,
  AssetObjectStorage
} from "../core/marketing-asset-library";

/** Existing DO transaction/storage contracts; no object or binding is created here. */
export function createEMP003AssetMetadataStorage(
  storage: Pick<DurableObjectStorage, "transaction">
): AssetMetadataStorage {
  return {
    transaction(work) {
      return storage.transaction((txn) =>
        work(createEMP003DurableStorageAdapter(txn))
      );
    }
  };
}

/** Caller must supply an independently authorized, environment-isolated bucket.
 * Private object keys never become public URLs and credentials are never returned.
 */
export function createEMP003AssetObjectStorage(
  bucket: Pick<R2Bucket, "get" | "put">
): AssetObjectStorage {
  return {
    async put(key, bytes, mimeType) {
      await bucket.put(key, Uint8Array.from(bytes), {
        httpMetadata: { contentType: mimeType }
      });
    },
    async get(key) {
      const object = await bucket.get(key);
      return object ? new Uint8Array(await object.arrayBuffer()) : undefined;
    }
  };
}

/** Isolated staging-only copy storage backed by the same tenant-scoped DO.
 * Keep object bytes separate from metadata and fail closed on oversized copies.
 * This is not a general replacement for R2 or binary creative assets.
 */
export function createEMP003StagingCopyObjectStorage(
  storage: Pick<DurableObjectStorage, "get" | "put">
): AssetObjectStorage {
  const prefix = "staging:copy-object:";
  const maxBytes = 64 * 1024;
  return {
    async put(key, bytes, mimeType) {
      if (mimeType !== "text/plain")
        throw new Error("COPY_STAGING_MIME_UNSUPPORTED");
      if (bytes.byteLength > maxBytes)
        throw new Error("COPY_STAGING_OBJECT_TOO_LARGE");
      await storage.put(prefix + key, Array.from(bytes));
    },
    async get(key) {
      const value = await storage.get<unknown>(prefix + key);
      if (value === undefined) return undefined;
      if (!Array.isArray(value) || value.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
        throw new Error("COPY_STAGING_OBJECT_CORRUPT");
      return Uint8Array.from(value);
    }
  };
}
