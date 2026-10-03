import assert from "node:assert/strict";
import test from "node:test";
import { buildAccessTenantRegistry, parseAccessIdentityBindings } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("duplicate normalized access identity is rejected before routing", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }
  ]));
  const bindings = parseAccessIdentityBindings(JSON.stringify([
    { email: "person@test", tenantId: "t", actorId: "one", role: "owner" },
    { email: " PERSON@test ", tenantId: "t", actorId: "two", role: "user" }
  ]));
  assert.throws(() => buildAccessTenantRegistry(bindings, manifests), /ACCESS_IDENTITY_MAP_DUPLICATE_EMAIL/);
});
