import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("malformed production tenant JSON is rejected with stable error", () => {
  assert.throws(() => parseRuntimeTenantRegistryManifests("{"), /TENANT_MANIFEST_STORE_INVALID_JSON/);
});
