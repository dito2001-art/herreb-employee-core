import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("registry backed production resolver returns normalized verified binding", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const identity = resolveAccessIdentityWithRegistry(" USER@CLIENT ", JSON.stringify([
    { email: "user@client", tenantId: "client", actorId: "user", role: "user" }
  ]), manifests);
  assert.deepEqual(identity, { email: "user@client", tenantId: "client", actorId: "user", role: "user" });
});
