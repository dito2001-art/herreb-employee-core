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
