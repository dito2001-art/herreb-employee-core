import assert from "node:assert/strict";
import test from "node:test";
import { TenantRegistry } from "../core/tenant-registry";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("same email identity cannot cross tenant boundary", () => {
  const registry = new TenantRegistry();
  for (const manifest of parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "a", enabledEmployees: ["EMP-002"], knowledgeNamespace: "a:k", offeringNamespace: "a:o" },
    { tenantId: "b", enabledEmployees: ["EMP-002"], knowledgeNamespace: "b:k", offeringNamespace: "b:o" }
  ]))) registry.registerTenant(manifest);
  registry.registerIdentity({ tenantId: "a", actorId: "owner-a", role: "owner", email: "owner@test" });
  assert.throws(() => registry.registerIdentity({ tenantId: "b", actorId: "owner-b", role: "owner", email: "owner@test" }), /IDENTITY_TENANT_CONFLICT/);
});
