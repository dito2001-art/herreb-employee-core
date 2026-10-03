import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";
import { resolveAccessIdentityWithRegistry } from "./access-identity";

const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }]));

test("identical duplicate email bindings fail closed", () => {
  const binding = { email: "shared@test", tenantId: "t", actorId: "a", role: "owner" };
  assert.throws(() => resolveAccessIdentityWithRegistry("shared@test", JSON.stringify([binding, binding]), manifests), /ACCESS_IDENTITY_MAP_DUPLICATE_EMAIL/);
});
