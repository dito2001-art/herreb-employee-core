import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";
import { resolveAccessIdentityWithRegistry } from "./access-identity";

const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }]));

test("configured email whitespace is normalized", () => {
  const identity = resolveAccessIdentityWithRegistry("owner@test.local", JSON.stringify([{ email: " OWNER@test.local ", tenantId: "t", actorId: "owner", role: "owner" }]), manifests);
  assert.equal(identity?.email, "owner@test.local");
});
