import assert from "node:assert/strict";
import test from "node:test";
import type { ServiceFetcher } from "../adapters";
import {
  SqliteAuditSink,
  StaticModelRouter,
  type AuditEvent,
  type AuditSqlStorage
} from "../core";
import { HerreBEmployeeRuntime } from "./runtime";
import { buildTenantReadOnlyRuntime } from "./tenant-capabilities";

class E2EAuditSql implements AuditSqlStorage {
  readonly events: AuditEvent[] = [];

  exec<T = Record<string, unknown>>(
    query: string,
    ...bindings: unknown[]
  ): Iterable<T> {
    const normalized = query.replace(/\s+/g, " ").trim();
    if (
      normalized.startsWith("CREATE TABLE") ||
      normalized.startsWith("CREATE INDEX")
    ) {
      return [];
    }
    if (normalized.startsWith("INSERT INTO employee_audit_events")) {
      this.events.push(JSON.parse(String(bindings[7])) as AuditEvent);
      return [];
    }
    if (normalized.startsWith("SELECT payload FROM employee_audit_events")) {
      const tenantId = String(bindings[0]);
      const correlationId = String(bindings[1]);
      return this.events
        .filter(
          (event) =>
            event.tenantId === tenantId && event.correlationId === correlationId
        )
        .map((event) => ({ payload: JSON.stringify(event) }) as T);
    }
    throw new Error(`Unexpected SQL: ${normalized}`);
  }
}

function service(
  name: string,
  requests: Array<{ name: string; request: Request }>
): ServiceFetcher {
  return {
    async fetch(input, init) {
      const request = new Request(input, init);
      requests.push({ name, request });
      return Response.json({ ok: true, source: name });
    }
  };
}

test("EMP-002 Client0 CRM Calendar Gmail read-only cycle is tenant scoped and durably auditable", async () => {
  const requests: Array<{ name: string; request: Request }> = [];
  const tenantId = "herreb-client-0";
  const correlationId = "corr-emp002-client0-e2e";
  const bootstrap = buildTenantReadOnlyRuntime(
    {
      AG002_GATEWAY: service("crm", requests),
      HERREB_RUNTIME_TOKEN: "crm-token",
      AG002_TENANT_ID: tenantId,
      CALENDAR_READ: service("calendar", requests),
      CALENDAR_READ_TOKEN: "calendar-token",
      CALENDAR_TENANT_ID: tenantId,
      EMAIL_READ: service("email", requests),
      EMAIL_READ_TOKEN: "email-token",
      EMAIL_TENANT_ID: tenantId
    },
    tenantId,
    []
  );
  const sql = new E2EAuditSql();
  const auditSink = new SqliteAuditSink(sql);
  const runtime = new HerreBEmployeeRuntime({
    modelRouter: new StaticModelRouter({
      provider: "workers-ai",
      model: "emp002-e2e",
      reason: "controlled Client0 test"
    }),
    adapters: bootstrap.adapters,
    auditSink
  });
  const session = await runtime.start({
    tenantId,
    employeeId: "EMP-002",
    workspaceId: "client0-e2e",
    actorId: "owner",
    channel: "test",
    correlationId
  });

  const crm = await session.execute("crm.read", {
    operation: "read",
    entity: "companies",
    payload: { limit: 1, offset: 0 }
  });
  const calendar = await session.execute("calendar.read", {
    operation: "search",
    timeMin: "2026-09-16T00:00:00-03:00",
    timeMax: "2026-09-17T00:00:00-03:00"
  });
  const email = await session.execute("email.read", {
    operation: "search",
    query: "HerreB",
    maxResults: 1
  });

  assert.equal(crm.ok, true);
  assert.equal(calendar.ok, true);
  assert.equal(email.ok, true);
  assert.deepEqual(
    requests.map(({ name }) => name),
    ["crm", "calendar", "email"]
  );
  for (const { request } of requests) {
    assert.equal(request.method, "GET");
    assert.equal(request.headers.get("X-Tenant-ID"), tenantId);
    assert.equal(request.headers.get("X-Correlation-ID"), correlationId);
  }

  const afterRestart = new SqliteAuditSink(sql);
  const audit = afterRestart.listByCorrelation(tenantId, correlationId);
  assert.deepEqual(
    audit.map((event) => event.capabilityId),
    ["crm.read", "calendar.read", "email.read"]
  );
  assert.deepEqual(
    audit.map((event) => event.evidence?.operation),
    ["read", "search", "search"]
  );
  assert.ok(audit.every((event) => event.employeeId === "EMP-002"));
  assert.ok(audit.every((event) => event.outcome === "SUCCESS"));
  assert.ok(audit.every((event) => event.evidence?.upstreamStatus === 200));
  const serializedAudit = JSON.stringify(audit);
  assert.equal(serializedAudit.includes("crm-token"), false);
  assert.equal(serializedAudit.includes("calendar-token"), false);
  assert.equal(serializedAudit.includes("email-token"), false);
});

test("EMP-002 unknown tenant gets no Client0 CRM Calendar or Gmail capability", () => {
  const tenantId = "herreb-client-0";
  const bootstrap = buildTenantReadOnlyRuntime(
    {
      AG002_GATEWAY: service("crm", []),
      HERREB_RUNTIME_TOKEN: "crm-token",
      AG002_TENANT_ID: tenantId,
      CALENDAR_READ: service("calendar", []),
      CALENDAR_READ_TOKEN: "calendar-token",
      CALENDAR_TENANT_ID: tenantId,
      EMAIL_READ: service("email", []),
      EMAIL_READ_TOKEN: "email-token",
      EMAIL_TENANT_ID: tenantId
    },
    "client-b",
    []
  );

  assert.equal(bootstrap.connectedCapabilities.has("crm.read"), false);
  assert.equal(bootstrap.connectedCapabilities.has("calendar.read"), false);
  assert.equal(bootstrap.connectedCapabilities.has("email.read"), false);
});
