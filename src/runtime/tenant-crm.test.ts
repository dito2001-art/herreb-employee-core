import assert from "node:assert/strict";
import test from "node:test";

import {
  createTenantCrmRegistry,
  parseTenantCrmConnectors
} from "./tenant-crm";

test("tenant CRM registry supports external and HerreB managed modes", () => {
  const registry = createTenantCrmRegistry(
    JSON.stringify([
      {
        tenantId: "herreb",
        mode: "HERREB_MANAGED_CRM",
        connectorId: "herreb-client0"
      },
      {
        tenantId: "client-a",
        mode: "EXTERNAL_CRM",
        connectorId: "hubspot-client-a"
      }
    ])
  );
  assert.deepEqual(registry.resolve("herreb"), {
    tenantId: "herreb",
    mode: "HERREB_MANAGED_CRM",
    connectorId: "herreb-client0"
  });
  assert.equal(registry.resolve("unknown"), undefined);
});

test("tenant CRM connector configuration rejects duplicate tenant ownership", () => {
  assert.throws(
    () =>
      parseTenantCrmConnectors([
        { tenantId: "a", mode: "EXTERNAL_CRM", connectorId: "one" },
        { tenantId: "a", mode: "HERREB_MANAGED_CRM", connectorId: "two" }
      ]),
    /TENANT_CRM_CONNECTOR_DUPLICATE/
  );
});

test("malformed connector configuration fails closed", () => {
  const registry = createTenantCrmRegistry("not-json");
  assert.throws(
    () => registry.resolve("herreb"),
    /TENANT_CRM_CONNECTORS_INVALID/
  );
});
