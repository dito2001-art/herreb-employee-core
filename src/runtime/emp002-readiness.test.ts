import assert from "node:assert/strict";
import test from "node:test";
import type { ServiceFetcher } from "../adapters";
import { buildTenantReadOnlyRuntime } from "./tenant-capabilities";
import {
  assertEmp002ReadOnlyReady,
  evaluateEmp002ReadOnlyReadiness
} from "./emp002-readiness";

const service: ServiceFetcher = {
  async fetch() {
    return Response.json({ ok: true });
  }
};

function completeClient0Bootstrap() {
  return buildTenantReadOnlyRuntime(
    {
      AG002_GATEWAY: service,
      HERREB_RUNTIME_TOKEN: "crm-token",
      AG002_TENANT_ID: "herreb-client-0",
      CALENDAR_READ: service,
      CALENDAR_READ_TOKEN: "calendar-token",
      CALENDAR_TENANT_ID: "herreb-client-0",
      EMAIL_READ: service,
      EMAIL_READ_TOKEN: "email-token",
      EMAIL_TENANT_ID: "herreb-client-0"
    },
    "herreb-client-0",
    []
  );
}

test("EMP-002 readiness passes only with all required reads and no writes", () => {
  const bootstrap = completeClient0Bootstrap();
  const readiness = evaluateEmp002ReadOnlyReadiness(bootstrap);

  assert.equal(readiness.ready, true);
  assert.deepEqual(readiness.missingReadCapabilities, []);
  assert.deepEqual(readiness.exposedWriteCapabilities, []);
  assert.doesNotThrow(() => assertEmp002ReadOnlyReady(bootstrap));
});

test("EMP-002 readiness fails closed when a required Client0 connector is missing", () => {
  const bootstrap = buildTenantReadOnlyRuntime(
    {
      AG002_GATEWAY: service,
      HERREB_RUNTIME_TOKEN: "crm-token",
      AG002_TENANT_ID: "herreb-client-0",
      CALENDAR_READ: service,
      CALENDAR_READ_TOKEN: "calendar-token",
      CALENDAR_TENANT_ID: "herreb-client-0"
    },
    "herreb-client-0",
    []
  );
  const readiness = evaluateEmp002ReadOnlyReadiness(bootstrap);

  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.missingReadCapabilities, ["email.read"]);
  assert.throws(
    () => assertEmp002ReadOnlyReady(bootstrap),
    /EMP002_READ_ONLY_NOT_READY/
  );
});

test("EMP-002 readiness fails closed for another tenant even when Client0 shared bindings exist", () => {
  const client0 = completeClient0Bootstrap();
  assert.equal(evaluateEmp002ReadOnlyReadiness(client0).ready, true);

  const otherTenant = buildTenantReadOnlyRuntime(
    {
      AG002_GATEWAY: service,
      HERREB_RUNTIME_TOKEN: "crm-token",
      AG002_TENANT_ID: "herreb-client-0",
      CALENDAR_READ: service,
      CALENDAR_READ_TOKEN: "calendar-token",
      CALENDAR_TENANT_ID: "herreb-client-0",
      EMAIL_READ: service,
      EMAIL_READ_TOKEN: "email-token",
      EMAIL_TENANT_ID: "herreb-client-0"
    },
    "client-b",
    []
  );
  const readiness = evaluateEmp002ReadOnlyReadiness(otherTenant);

  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.missingReadCapabilities, [
    "crm.read",
    "calendar.read",
    "email.read"
  ]);
});
