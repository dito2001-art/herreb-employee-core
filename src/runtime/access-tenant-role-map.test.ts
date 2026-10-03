import assert from "node:assert/strict";
import test from "node:test";
import { buildAccessTenantRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("runtime user maps to team role in shared tenant registry", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }
  ]));
  const registry = buildAccessTenantRegistry([{ email: "team@test", tenantId: "t", actorId: "team", role: "user" }], manifests);
  assert.equal(registry.resolveIdentity({ email: "team@test" })?.role, "team");
});
