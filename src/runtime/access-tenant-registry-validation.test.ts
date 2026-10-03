import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("tenant registry authentication fails closed when manifest store is missing", () => {
  assert.throws(() => parseRuntimeTenantRegistryManifests(undefined), /TENANT_MANIFEST_STORE_NOT_CONFIGURED/);
});

test("tenant registry authentication fails closed when manifest store is malformed", () => {
  assert.throws(() => parseRuntimeTenantRegistryManifests("{}"), /TENANT_MANIFEST_STORE_INVALID/);
});
