import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";
import { resolveAccessIdentityWithRegistry } from "./access-identity";

test("production identity contract rejects tenant not provisioned", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }]));
  assert.throws(() => resolveAccessIdentityWithRegistry("other@test", JSON.stringify([{ email: "other@test", tenantId: "other", actorId: "other", role: "user" }]), manifests));
});
