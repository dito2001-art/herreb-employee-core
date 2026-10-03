import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";
import { resolveAccessIdentityWithRegistry } from "./access-identity";

const rawManifest = JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }]);

test("owner role survives shared registry validation", () => {
  const identity = resolveAccessIdentityWithRegistry("owner@test", JSON.stringify([{ email: "owner@test", tenantId: "t", actorId: "owner", role: "owner" }]), parseRuntimeTenantRegistryManifests(rawManifest));
  assert.equal(identity?.role, "owner");
});

test("user role survives shared registry validation", () => {
  const identity = resolveAccessIdentityWithRegistry("user@test", JSON.stringify([{ email: "user@test", tenantId: "t", actorId: "user", role: "user" }]), parseRuntimeTenantRegistryManifests(rawManifest));
  assert.equal(identity?.role, "user");
});
