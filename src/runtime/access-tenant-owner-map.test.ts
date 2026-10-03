import assert from "node:assert/strict";
import test from "node:test";
import { buildAccessTenantRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("runtime owner remains owner in shared tenant registry", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }
  ]));
  const registry = buildAccessTenantRegistry([{ email: "owner@test", tenantId: "t", actorId: "owner", role: "owner" }], manifests);
  assert.equal(registry.resolveIdentity({ email: "owner@test" })?.role, "owner");
});
