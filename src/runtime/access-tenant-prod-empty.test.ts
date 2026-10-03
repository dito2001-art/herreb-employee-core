import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("empty production tenant array is valid but authorizes no tenant", () => {
  assert.deepEqual(parseRuntimeTenantRegistryManifests("[]"), []);
});
