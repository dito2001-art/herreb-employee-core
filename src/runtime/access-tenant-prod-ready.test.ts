import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production registry backed identity is ready for EMP-002 routing", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const identity = resolveAccessIdentityWithRegistry("team@client", JSON.stringify([
    { email: "team@client", tenantId: "client", actorId: "team", role: "user" }
  ]), manifests);
  assert.equal(identity?.tenantId, "client");
  assert.equal(identity?.actorId, "team");
});
