import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("missing production tenant store is rejected", () => {
  assert.throws(() => parseRuntimeTenantRegistryManifests(undefined), /TENANT_MANIFEST_STORE_NOT_CONFIGURED/);
});
