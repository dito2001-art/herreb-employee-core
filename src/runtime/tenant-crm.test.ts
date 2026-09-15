import assert from "node:assert/strict";
import test from "node:test";
import type { ServiceFetcher } from "../adapters";

import {
  createTenantCrmRegistry,
  parseTenantCrmConnectors,
  resolveTenantCrm
} from "./tenant-crm";

function service(): ServiceFetcher {
  return {
    async fetch() {
      return Response.json({ ok: true });
    }
  };
}

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

test("tenant CRM resolution selects only the connector owned by that tenant", () => {
  const registry = createTenantCrmRegistry(
    JSON.stringify([
      {
        tenantId: "herreb",
        mode: "HERREB_MANAGED_CRM",
        connectorId: "crm-herreb"
      },
      {
        tenantId: "client-b",
        mode: "HERREB_MANAGED_CRM",
        connectorId: "crm-client-b"
      }
    ])
  );
  const herrebService = service();
  const clientBService = service();
  const bindings = [
    {
      connectorId: "crm-herreb",
      service: herrebService,
      runtimeToken: "herreb-token"
    },
    {
      connectorId: "crm-client-b",
      service: clientBService,
      runtimeToken: "client-b-token"
    }
  ];

  assert.equal(resolveTenantCrm("herreb", registry, bindings)?.binding.service, herrebService);
  assert.equal(
    resolveTenantCrm("client-b", registry, bindings)?.binding.service,
    clientBService
  );
  assert.equal(resolveTenantCrm("unknown", registry, bindings), undefined);
});

test("tenant CRM resolution fails closed for missing duplicate or tokenless bindings", () => {
  const registry = createTenantCrmRegistry(
    JSON.stringify([
      {
        tenantId: "herreb",
        mode: "HERREB_MANAGED_CRM",
        connectorId: "crm-herreb"
      }
    ])
  );
  const crmService = service();

  assert.throws(
    () => resolveTenantCrm("herreb", registry, []),
    /TENANT_CRM_BINDING_MISSING/
  );
  assert.throws(
    () =>
      resolveTenantCrm("herreb", registry, [
        { connectorId: "crm-herreb", service: crmService, runtimeToken: "one" },
        { connectorId: "crm-herreb", service: crmService, runtimeToken: "two" }
      ]),
    /TENANT_CRM_BINDING_DUPLICATE/
  );
  assert.throws(
    () =>
      resolveTenantCrm("herreb", registry, [
        { connectorId: "crm-herreb", service: crmService, runtimeToken: " " }
      ]),
    /TENANT_CRM_BINDING_TOKEN_MISSING/
  );
});
