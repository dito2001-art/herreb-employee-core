import assert from "node:assert/strict";
import test from "node:test";
import { TenantRegistry } from "../core/tenant-registry";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("same WhatsApp identity cannot cross tenant boundary", () => {
  const registry = new TenantRegistry();
  for (const manifest of parseRuntimeTenantRegistryManifests(JSON.stringify([
    { tenantId: "a", enabledEmployees: ["EMP-002"], knowledgeNamespace: "a:k", offeringNamespace: "a:o" },
    { tenantId: "b", enabledEmployees: ["EMP-002"], knowledgeNamespace: "b:k", offeringNamespace: "b:o" }
  ]))) registry.registerTenant(manifest);
  registry.registerIdentity({ tenantId: "a", actorId: "client-a", role: "external_contact", whatsapp: "+595981000001" });
  assert.throws(() => registry.registerIdentity({ tenantId: "b", actorId: "client-b", role: "external_contact", whatsapp: "+595981000001" }), /IDENTITY_TENANT_CONFLICT/);
});
