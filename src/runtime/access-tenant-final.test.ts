import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";
import { resolveAccessIdentityWithRegistry } from "./access-identity";

test("production identity contract resolves tenant actor and role together", () => {
  const manifests = parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "client", enabledEmployees: ["EMP-002"], knowledgeNamespace: "client:k", offeringNamespace: "client:o" }]));
  const identity = resolveAccessIdentityWithRegistry("team@client", JSON.stringify([{ email: "team@client", tenantId: "client", actorId: "team-1", role: "user" }]), manifests);
  assert.deepEqual(identity, { email: "team@client", tenantId: "client", actorId: "team-1", role: "user" });
});
