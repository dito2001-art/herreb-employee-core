import assert from "node:assert/strict";
import test from "node:test";
import { buildAccessTenantRegistry, parseAccessIdentityBindings } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("runtime owner maps to owner registry identity", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }]));
  const bindings = parseAccessIdentityBindings(JSON.stringify([{ email: "owner@test", tenantId: "t", actorId: "owner", role: "owner" }]));
  assert.equal(buildAccessTenantRegistry(bindings, manifests).resolveIdentity({ email: "owner@test" })?.role, "owner");
});
