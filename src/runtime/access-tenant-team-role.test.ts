import assert from "node:assert/strict";
import test from "node:test";
import { buildAccessTenantRegistry, parseAccessIdentityBindings } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("runtime user maps to team registry identity", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }]));
  const bindings = parseAccessIdentityBindings(JSON.stringify([{ email: "user@test", tenantId: "t", actorId: "user", role: "user" }]));
  assert.equal(buildAccessTenantRegistry(bindings, manifests).resolveIdentity({ email: "user@test" })?.role, "team");
});
