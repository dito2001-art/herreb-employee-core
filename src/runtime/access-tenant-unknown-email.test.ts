import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";
import { resolveAccessIdentityWithRegistry } from "./access-identity";

const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }]));

test("unknown email resolves to no identity", () => {
  assert.equal(resolveAccessIdentityWithRegistry("unknown@test.local", JSON.stringify([{ email: "known@test.local", tenantId: "t", actorId: "known", role: "user" }]), manifests), undefined);
});
