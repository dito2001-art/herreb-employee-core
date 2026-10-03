import assert from "node:assert/strict";
import test from "node:test";
import { buildAccessTenantRegistry, resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("tenant isolation contract keeps identity entitlement and namespace aligned", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "a", enabledEmployees: ["EMP-002"], knowledgeNamespace: "a:k", offeringNamespace: "a:o" },
    { tenantId: "b", enabledEmployees: ["EMP-001", "EMP-002"], knowledgeNamespace: "b:k", offeringNamespace: "b:o" }
  ]));
  const bindings = [{ email: "a@test", tenantId: "a", actorId: "a", role: "owner" as const }];
  const identity = resolveAccessIdentityWithRegistry("a@test", JSON.stringify(bindings), manifests);
  assert.equal(identity?.tenantId, "a");
  const registry = buildAccessTenantRegistry(bindings, manifests);
  assert.equal(registry.requireEmployee("a", "EMP-002").knowledgeNamespace, "a:k");
  assert.throws(() => registry.requireEmployee("a", "EMP-001"), /EMPLOYEE_NOT_ENABLED_FOR_TENANT/);
});
