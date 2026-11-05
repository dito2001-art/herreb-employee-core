import assert from "node:assert/strict";
import { test } from "node:test";
import { createEMP003StagingCopyObjectStorage } from "./emp003-asset-storage";

function fixture() {
  const values = new Map<string, unknown>();
  const storage = {
    async get<T>(key: string): Promise<T | undefined> { return values.get(key) as T | undefined; },
    async put<T>(key: string, value: T): Promise<void> { values.set(key, value); }
  };
  return { objects: createEMP003StagingCopyObjectStorage(storage), values };
}

test("staging copy bytes roundtrip and absent key", async () => {
  const { objects } = fixture();
  const bytes = new TextEncoder().encode("Texto de prueba ñ");
  await objects.put("tenant-a/campaign-1/copy-1/hash", bytes, "text/plain");
  assert.deepEqual(await objects.get("tenant-a/campaign-1/copy-1/hash"), bytes);
  assert.equal(await objects.get("missing"), undefined);
});

test("staging copy refuses unsupported media and oversized content", async () => {
  const { objects, values } = fixture();
  await assert.rejects(objects.put("image", new Uint8Array([1]), "image/png"), /COPY_STAGING_MIME_UNSUPPORTED/);
  await assert.rejects(objects.put("large", new Uint8Array(65537), "text/plain"), /COPY_STAGING_OBJECT_TOO_LARGE/);
  assert.equal(values.size, 0);
});

test("staging copy rejects corrupted stored bytes", async () => {
  const { objects, values } = fixture();
  values.set("staging:copy-object:corrupt", [0, 256]);
  await assert.rejects(objects.get("corrupt"), /COPY_STAGING_OBJECT_CORRUPT/);
});
