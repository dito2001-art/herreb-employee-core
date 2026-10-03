import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("registry authentication has no implicit tenant fallback", () => {
  assert.throws(() => parseRuntimeTenantRegistryManifests(" "), /TENANT_MANIFEST_STORE_NOT_CONFIGURED/);
});
