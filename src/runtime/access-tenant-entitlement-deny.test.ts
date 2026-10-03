import assert from "node:assert/strict";
import test from "node:test";
import { TenantRegistry } from "../core/tenant-registry";
import { parseRuntimeTenantRegistryManifests } from "./access-tenant-registry";

const raw = JSON.stringify([{ tenantId: "tenant-b-test", enabledEmployees: ["EMP-002"], knowledgeNamespace: "tenant-b-test:knowledge", offeringNamespace: "tenant-b-test:offerings" }]);

test("tenant employee entitlement is deny by default", () => {
  const registry = new TenantRegistry();
  for (const manifest of parseRuntimeTenantRegistryManifests(raw)) registry.registerTenant(manifest);
  assert.throws(() => registry.requireEmployee("tenant-b-test", "EMP-001"));
});
