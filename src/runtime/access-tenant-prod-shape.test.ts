import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("non-array production tenant store is rejected", () => {
  assert.throws(() => parseRuntimeTenantRegistryManifests("{}"), /TENANT_MANIFEST_STORE_INVALID/);
});
