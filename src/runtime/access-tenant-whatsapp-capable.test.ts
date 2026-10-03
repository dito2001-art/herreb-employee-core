import assert from "node:assert/strict";
import test from "node:test";
import { TenantRegistry } from "../core/tenant-registry";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

test("shared registry supports WhatsApp identity alongside Access email", () => {
  const registry = new TenantRegistry();
  for (const manifest of parseRuntimeTenantRegistryManifests(JSON.stringify([{ tenantId: "t", enabledEmployees: ["EMP-002"], knowledgeNamespace: "t:k", offeringNamespace: "t:o" }]))) registry.registerTenant(manifest);
  registry.registerIdentity({ tenantId: "t", actorId: "contact", role: "external_contact", whatsapp: "+595 981 000 001" });
  assert.equal(registry.resolveIdentity({ whatsapp: "595981000001" })?.tenantId, "t");
});
