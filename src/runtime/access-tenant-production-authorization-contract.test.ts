import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production authorization requires identity and tenant agreement", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "k", offeringNamespace: "o" }]));
  assert.equal(resolveAccessIdentityWithRegistry("o@test", JSON.stringify([{ email: "o@test", tenantId: "t", actorId: "o", role: "owner" }]), manifests)?.tenantId, "t");
});
