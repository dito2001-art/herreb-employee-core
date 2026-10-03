import assert from "node:assert/strict";
import test from "node:test";
import { buildAccessTenantRegistry, resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("final EMP-002 access contract is tenant explicit and deny by default", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }
  ]));
  const map = JSON.stringify([{ email: "owner@client", tenantId: "client", actorId: "owner", role: "owner" }]);
  const identity = resolveAccessIdentityWithRegistry("owner@client", map, manifests);
  assert.equal(identity?.tenantId, "client");
  assert.equal(resolveAccessIdentityWithRegistry("unknown@client", map, manifests), undefined);
  const registry = buildAccessTenantRegistry([{ email: "owner@client", tenantId: "client", actorId: "owner", role: "owner" }], manifests);
  assert.equal(registry.requireEmployee("client", "EMP-002").knowledgeNamespace, "client:k");
});
