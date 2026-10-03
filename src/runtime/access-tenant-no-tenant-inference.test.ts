import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccessIdentityWithRegistry } from "./access-identity";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("email domain never implies tenant assignment", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "example.com", enabledEmployees: ["EMP-002"], knowledgeNamespace: "x:k", offeringNamespace: "x:o" }
  ]));
  assert.equal(resolveAccessIdentityWithRegistry("user@example.com", undefined, manifests), undefined);
});
