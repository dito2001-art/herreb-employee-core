import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("shared registry production bridge resolves only explicit assignment", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const map = JSON.stringify([{ email: "owner@client", tenantId: "client", actorId: "owner", role: "owner" }]);
  assert.equal(resolveAccessIdentityWithRegistry("owner@client", map, manifests)?.tenantId, "client");
  assert.equal(resolveAccessIdentityWithRegistry("other@client", map, manifests), undefined);
});
