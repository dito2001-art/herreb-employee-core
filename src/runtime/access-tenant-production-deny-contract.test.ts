import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("missing production registry contract is denied", () => {
  assert.throws(() => parseRuntimeTenantRegistryManifests(undefined));
});
