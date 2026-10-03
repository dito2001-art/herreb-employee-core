import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production tenant registry requires explicit manifest configuration", () => {
  assert.throws(() => parseRuntimeTenantRegistryManifests(undefined), /TENANT_MANIFEST_STORE_NOT_CONFIGURED/);
  assert.throws(() => parseRuntimeTenantRegistryManifests(""), /TENANT_MANIFEST_STORE_NOT_CONFIGURED/);
});
