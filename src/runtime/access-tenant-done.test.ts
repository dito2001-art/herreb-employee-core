import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("EMP-002 registry backed access identity block resolves valid assignment", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  assert.equal(resolveAccessIdentityWithRegistry("owner@client", JSON.stringify([
    { email: "owner@client", tenantId: "client", actorId: "owner", role: "owner" }
  ]), manifests)?.actorId, "owner");
});
