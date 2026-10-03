import assert from "node:assert/strict";
import test from "node:test";
import { TenantRegistry } from "../core/tenant-registry";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("email and WhatsApp identities can share tenant without sharing actor", () => {
  const registry = new TenantRegistry();
  for (const manifest of parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }]))) registry.registerTenant(manifest);
  registry.registerIdentity({ tenantId: "t", actorId: "owner", role: "owner", email: "owner@test" });
  registry.registerIdentity({ tenantId: "t", actorId: "client", role: "external_contact", whatsapp: "+595981000001" });
  assert.equal(registry.resolveIdentity({ email: "owner@test" })?.actorId, "owner");
  assert.equal(registry.resolveIdentity({ whatsapp: "+595981000001" })?.actorId, "client");
});
