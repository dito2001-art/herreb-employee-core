import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";
import { resolveAccessIdentityWithRegistry } from "./access-identity";

const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }]));

test("empty configured email fails closed", () => {
  assert.throws(() => resolveAccessIdentityWithRegistry("owner@test", JSON.stringify([{ email: " ", tenantId: "t", actorId: "owner", role: "owner" }]), manifests), /ACCESS_IDENTITY_MAP_INVALID_ENTRY/);
});
