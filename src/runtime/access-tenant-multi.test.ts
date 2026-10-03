import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";
import { resolveAccessIdentityWithRegistry } from "./access-identity";

const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
  { tenantId: "a", enabledEmployees: ["EMP-002"], knowledgeNamespace: "a:k", offeringNamespace: "a:o" },
  { tenantId: "b", enabledEmployees: ["EMP-002"], knowledgeNamespace: "b:k", offeringNamespace: "b:o" }
]));
const identities = JSON.stringify([
  { email: "a@test.local", tenantId: "a", actorId: "a-owner", role: "owner" },
  { email: "b@test.local", tenantId: "b", actorId: "b-owner", role: "owner" }
]);

test("independent tenant identities resolve independently", () => {
  assert.equal(resolveAccessIdentityWithRegistry("a@test.local", identities, manifests)?.tenantId, "a");
  assert.equal(resolveAccessIdentityWithRegistry("b@test.local", identities, manifests)?.tenantId, "b");
});
