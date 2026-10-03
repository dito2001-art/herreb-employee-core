import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";
import { resolveAccessIdentityWithRegistry } from "./access-identity";

test("valid production configuration authorizes registered EMP-002 owner", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "herreb-client-0", enabledEmployees: ["EMP-001", "EMP-002"], knowledgeNamespace: "herreb:k", offeringNamespace: "herreb:o" }]));
  const identity = resolveAccessIdentityWithRegistry("owner@herreb.test", JSON.stringify([{ email: "owner@herreb.test", tenantId: "herreb-client-0", actorId: "owner", role: "owner" }]), manifests);
  assert.equal(identity?.tenantId, "herreb-client-0");
});
