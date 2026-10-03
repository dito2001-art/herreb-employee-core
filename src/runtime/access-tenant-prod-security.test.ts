import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("identity store cannot introduce an unprovisioned tenant", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "k", offeringNamespace: "o" }]));
  assert.throws(() => resolveAccessIdentityWithRegistry("x@test", JSON.stringify([{ email: "x@test", tenantId: "x", actorId: "x", role: "owner" }]), manifests));
});
