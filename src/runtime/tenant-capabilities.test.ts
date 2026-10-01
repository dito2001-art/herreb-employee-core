import assert from "node:assert/strict";
import test from "node:test";
import type { ServiceFetcher } from "../adapters";
import { buildTenantReadOnlyRuntime } from "./tenant-capabilities";

function service(): ServiceFetcher { return { async fetch() { return Response.json({ ok: true }); } }; }
const connectors = JSON.stringify([
  { tenantId: "herreb", mode: "HERREB_MANAGED_CRM", connectorId: "crm-herreb" },
  { tenantId: "client-b", mode: "HERREB_MANAGED_CRM", connectorId: "crm-client-b" }
]);

test("tenant runtime exposes only its own CRM Calendar and Email connectors", () => {
  const bindings = [
    { connectorId: "crm-herreb", service: service(), runtimeToken: "herreb-crm-token", calendarService: service(), calendarToken: "herreb-calendar-token", emailService: service(), emailToken: "herreb-email-token" },
    { connectorId: "crm-client-b", service: service(), runtimeToken: "client-b-crm-token", calendarService: service(), calendarToken: "client-b-calendar-token", emailService: service(), emailToken: "client-b-email-token" }
  ];
  const herreb = buildTenantReadOnlyRuntime({ TENANT_CRM_CONNECTORS_JSON: connectors }, "herreb", bindings);
  const clientB = buildTenantReadOnlyRuntime({ TENANT_CRM_CONNECTORS_JSON: connectors }, "client-b", bindings);
  assert.equal(herreb.diagnostics.crm, "CONNECTED");
  assert.equal(herreb.diagnostics.calendar, "CONNECTED");
  assert.equal(herreb.diagnostics.email, "CONNECTED");
  assert.equal(clientB.diagnostics.crm, "CONNECTED");
  assert.equal(clientB.diagnostics.calendar, "CONNECTED");
  assert.equal(clientB.diagnostics.email, "CONNECTED");
});

test("managed CRM exposes calendar through the CRM-backed facade without direct Google access", () => {
  const current = buildTenantReadOnlyRuntime({ TENANT_CRM_CONNECTORS_JSON: connectors }, "herreb", [{ connectorId: "crm-herreb", service: service(), runtimeToken: "crm-token" }]);
  assert.equal(current.diagnostics.crm, "CONNECTED");
  assert.equal(current.diagnostics.calendar, "CONNECTED");
  assert.equal(current.diagnostics.email, "MISSING_BINDING");
  assert.equal(current.connectedCapabilities.has("calendar.read"), true);
  assert.equal(current.connectedCapabilities.has("email.read"), false);
});

test("unscoped legacy Google fallback is ignored while managed CRM remains the calendar source", () => {
  const current = buildTenantReadOnlyRuntime({ TENANT_CRM_CONNECTORS_JSON: connectors, CALENDAR_READ: service(), CALENDAR_READ_TOKEN: "calendar-token", EMAIL_READ: service(), EMAIL_READ_TOKEN: "email-token" }, "herreb", [{ connectorId: "crm-herreb", service: service(), runtimeToken: "crm-token" }]);
  assert.equal(current.diagnostics.calendar, "CONNECTED");
  assert.equal(current.diagnostics.email, "MISSING_BINDING");
  assert.equal(current.connectedCapabilities.has("calendar.read"), true);
  assert.equal(current.connectedCapabilities.has("email.read"), false);
});

test("matching shared Client0 scope exposes read capabilities", () => {
  const current = buildTenantReadOnlyRuntime({ CALENDAR_READ: service(), CALENDAR_READ_TOKEN: "calendar-token", CALENDAR_TENANT_ID: "herreb-client-0", EMAIL_READ: service(), EMAIL_READ_TOKEN: "email-token", EMAIL_TENANT_ID: "herreb-client-0" }, "herreb-client-0", []);
  assert.equal(current.diagnostics.calendar, "CONNECTED");
  assert.equal(current.diagnostics.email, "CONNECTED");
  assert.equal(current.connectedCapabilities.has("calendar.read"), true);
  assert.equal(current.connectedCapabilities.has("email.read"), true);
});

test("unknown tenant cannot inherit Client0 shared connector scope", () => {
  const current = buildTenantReadOnlyRuntime({ AG002_GATEWAY: service(), RUNTIME_GATEWAY_TOKEN: "crm-token", AG002_TENANT_ID: "herreb-client-0", CALENDAR_READ: service(), CALENDAR_READ_TOKEN: "calendar-token", CALENDAR_TENANT_ID: "herreb-client-0", EMAIL_READ: service(), EMAIL_READ_TOKEN: "email-token", EMAIL_TENANT_ID: "herreb-client-0" }, "unknown", []);
  assert.equal(current.diagnostics.crm, "MISSING_BINDING");
  assert.equal(current.diagnostics.calendar, "MISSING_BINDING");
  assert.equal(current.diagnostics.email, "MISSING_BINDING");
  assert.equal(current.connectedCapabilities.has("crm.read"), false);
  assert.equal(current.connectedCapabilities.has("calendar.read"), false);
  assert.equal(current.connectedCapabilities.has("email.read"), false);
});
