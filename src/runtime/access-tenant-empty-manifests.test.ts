import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("configured identity cannot resolve when no tenant is registered", () => {
  const manifests = parseRuntimeTenantRegistryManifests("[]");
  const map = JSON.stringify([{ email: "owner@test", tenantId: "t", actorId: "owner", role: "owner" }]);
  assert.throws(() => resolveAccessIdentityWithRegistry("owner@test", map, manifests), /TENANT_NOT_FOUND/);
});
