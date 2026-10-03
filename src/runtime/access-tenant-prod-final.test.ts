import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production access identity is explicit tenant scoped and normalized", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const map = JSON.stringify([{ email: "user@client", tenantId: "client", actorId: "user", role: "user" }]);
  const identity = resolveAccessIdentityWithRegistry(" USER@CLIENT ", map, manifests);
  assert.equal(identity?.tenantId, "client");
  assert.equal(identity?.email, "user@client");
});
