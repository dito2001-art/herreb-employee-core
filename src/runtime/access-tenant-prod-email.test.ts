import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("production email is normalized after registry validation", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "k", offeringNamespace: "o" }]));
  assert.equal(resolveAccessIdentityWithRegistry(" OWNER@TEST ", JSON.stringify([{ email: "owner@test", tenantId: "t", actorId: "owner", role: "owner" }]), manifests)?.email, "owner@test");
});
