import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("invalid tenant manifest JSON fails closed", () => {
  assert.throws(() => parseRuntimeTenantRegistryManifests("not-json"));
});
