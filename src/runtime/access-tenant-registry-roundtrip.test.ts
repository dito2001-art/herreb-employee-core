import assert from "node:assert/strict";
import test from "node:test";
import { buildAccessTenantRegistry, parseAccessIdentityBindings } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("shared registry resolves normalized access identity", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }]));
  const bindings = parseAccessIdentityBindings(JSON.stringify([{ email: "OWNER@TEST", tenantId: "t", actorId: "owner", role: "owner" }]));
  const identity = buildAccessTenantRegistry(bindings, manifests).resolveIdentity({ email: "owner@test" });
  assert.equal(identity?.tenantId, "t");
  assert.equal(identity?.role, "owner");
});
