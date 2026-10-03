import assert from "node:assert/strict";
import test from "node:test";
import { buildAccessTenantRegistry, parseAccessIdentityBindings } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("registry rejects binding to unregistered tenant", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "known", enabledEmployees: ["EMP-002"], knowledgeNamespace: "k:k", offeringNamespace: "k:o" }]));
  const bindings = parseAccessIdentityBindings(JSON.stringify([{ email: "owner@test", tenantId: "missing", actorId: "owner", role: "owner" }]));
  assert.throws(() => buildAccessTenantRegistry(bindings, manifests), /TENANT_NOT_FOUND/);
});
