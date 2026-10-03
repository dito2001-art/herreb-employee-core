import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production user role is preserved after registry validation", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "k", offeringNamespace: "o" }]));
  assert.equal(resolveAccessIdentityWithRegistry("user@test", JSON.stringify([{ email: "user@test", tenantId: "t", actorId: "user", role: "user" }]), manifests)?.role, "user");
});
