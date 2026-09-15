import assert from "node:assert/strict";
import test from "node:test";
import type { ServiceFetcher } from "../adapters";
import { buildTenantReadOnlyRuntime } from "./tenant-capabilities";

function service(): ServiceFetcher {
  return {
    async fetch() {
      return Response.json({ ok: true });
    }
  };
}

const connectors = JSON.stringify([
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
]);

test("tenant runtime exposes only its own CRM and calendar connector", () => {
  const herrebCrm = service();
  const herrebCalendar = service();
  const clientBCrm = service();
  const clientBCalendar = service();
  const bindings = [
    {
      connectorId: "crm-herreb",
      service: herrebCrm,
      runtimeToken: "herreb-crm-token",
      calendarService: herrebCalendar,
      calendarToken: "herreb-calendar-token"
    },
    {
      connectorId: "crm-client-b",
      service: clientBCrm,
      runtimeToken: "client-b-crm-token",
      calendarService: clientBCalendar,
      calendarToken: "client-b-calendar-token"
    }
  ];

  const herreb = buildTenantReadOnlyRuntime(
    { TENANT_CRM_CONNECTORS_JSON: connectors },
    "herreb",
    bindings
  );
  const clientB = buildTenantReadOnlyRuntime(
    { TENANT_CRM_CONNECTORS_JSON: connectors },
    "client-b",
    bindings
  );

  assert.equal(herreb.diagnostics.crm, "CONNECTED");
  assert.equal(herreb.diagnostics.calendar, "CONNECTED");
  assert.equal(clientB.diagnostics.crm, "CONNECTED");
  assert.equal(clientB.diagnostics.calendar, "CONNECTED");
});

test("managed CRM without a calendar connector does not invent calendar access", () => {
  const current = buildTenantReadOnlyRuntime(
    { TENANT_CRM_CONNECTORS_JSON: connectors },
    "herreb",
    [
      {
        connectorId: "crm-herreb",
        service: service(),
        runtimeToken: "crm-token"
      }
    ]
  );

  assert.equal(current.diagnostics.crm, "CONNECTED");
  assert.equal(current.diagnostics.calendar, "MISSING_BINDING");
  assert.equal(current.connectedCapabilities.has("calendar.read"), false);
});

test("unknown tenant receives no managed CRM or calendar capability", () => {
  const current = buildTenantReadOnlyRuntime(
    { TENANT_CRM_CONNECTORS_JSON: connectors },
    "unknown",
    [
      {
        connectorId: "crm-herreb",
        service: service(),
        runtimeToken: "crm-token",
        calendarService: service(),
        calendarToken: "calendar-token"
      }
    ]
  );

  assert.equal(current.diagnostics.crm, "MISSING_BINDING");
  assert.equal(current.diagnostics.calendar, "MISSING_BINDING");
});
