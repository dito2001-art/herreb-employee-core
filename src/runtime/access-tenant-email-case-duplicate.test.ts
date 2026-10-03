import assert from "node:assert/strict";
import test from "node:test";
import { buildAccessTenantRegistry, parseAccessIdentityBindings } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("case variants normalize to duplicate identity and are rejected", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }
  ]));
  const bindings = parseAccessIdentityBindings(JSON.stringify([
    { email: "A@Test", tenantId: "t", actorId: "a", role: "owner" },
    { email: "a@test", tenantId: "t", actorId: "b", role: "user" }
  ]));
  assert.throws(() => buildAccessTenantRegistry(bindings, manifests), /ACCESS_IDENTITY_MAP_DUPLICATE_EMAIL/);
});
