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

test("tenant runtime exposes only its own CRM Calendar and Email connectors", () => {
  const herrebCrm = service();
  const herrebCalendar = service();
  const herrebEmail = service();
  const clientBCrm = service();
  const clientBCalendar = service();
  const clientBEmail = service();
  const bindings = [
    {
      connectorId: "crm-herreb",
      service: herrebCrm,
      runtimeToken: "herreb-crm-token",
      calendarService: herrebCalendar,
      calendarToken: "herreb-calendar-token",
      emailService: herrebEmail,
      emailToken: "herreb-email-token"
    },
    {
      connectorId: "crm-client-b",
      service: clientBCrm,
      runtimeToken: "client-b-crm-token",
      calendarService: clientBCalendar,
      calendarToken: "client-b-calendar-token",
      emailService: clientBEmail,
      emailToken: "client-b-email-token"
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
  assert.equal(herreb.diagnostics.email, "CONNECTED");
  assert.equal(clientB.diagnostics.crm, "CONNECTED");
  assert.equal(clientB.diagnostics.calendar, "CONNECTED");
  assert.equal(clientB.diagnostics.email, "CONNECTED");
});

test("managed CRM without Google connectors does not invent Google access", () => {
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
  assert.equal(current.diagnostics.email, "MISSING_BINDING");
  assert.equal(current.connectedCapabilities.has("calendar.read"), false);
  assert.equal(current.connectedCapabilities.has("email.read"), false);
});

test("shared Google fallback requires an explicit tenant scope", () => {
  const current = buildTenantReadOnlyRuntime(
    {
      TENANT_CRM_CONNECTORS_JSON: connectors,
      CALENDAR_READ: service(),
      CALENDAR_READ_TOKEN: "calendar-token",
      EMAIL_READ: service(),
      EMAIL_READ_TOKEN: "email-token"
    },
    "herreb",
    [
      {
        connectorId: "crm-herreb",
        service: service(),
        runtimeToken: "crm-token"
      }
    ]
  );

  assert.equal(current.diagnostics.calendar, "MISSING_TENANT_SCOPE");
  assert.equal(current.diagnostics.email, "MISSING_TENANT_SCOPE");
  assert.equal(current.connectedCapabilities.has("calendar.read"), false);
  assert.equal(current.connectedCapabilities.has("email.read"), false);
});

test("unknown tenant cannot inherit Client0 shared Google scope", () => {
  const current = buildTenantReadOnlyRuntime(
    {
      TENANT_CRM_CONNECTORS_JSON: connectors,
      CALENDAR_READ: service(),
      CALENDAR_READ_TOKEN: "calendar-token",
      CALENDAR_TENANT_ID: "herreb",
      EMAIL_READ: service(),
      EMAIL_READ_TOKEN: "email-token",
      EMAIL_TENANT_ID: "herreb"
    },
    "unknown",
    [
      {
        connectorId: "crm-herreb",
        service: service(),
        runtimeToken: "crm-token"
      }
    ]
  );

  assert.equal(current.diagnostics.crm, "MISSING_BINDING");
  assert.equal(current.diagnostics.calendar, "CONNECTED");
  assert.equal(current.diagnostics.email, "CONNECTED");
});
