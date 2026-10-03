import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production owner role is preserved after registry validation", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "k", offeringNamespace: "o" }]));
  assert.equal(resolveAccessIdentityWithRegistry("owner@test", JSON.stringify([{ email: "owner@test", tenantId: "t", actorId: "owner", role: "owner" }]), manifests)?.role, "owner");
});
