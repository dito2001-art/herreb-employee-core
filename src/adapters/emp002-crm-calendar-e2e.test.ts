import assert from "node:assert/strict";
import test from "node:test";
import { createAg002GatewayControlledWriteTransport, createAg002GatewayReadOnlyTransport } from "./ag002-gateway";
import { createCrmCalendarControlledWriteTransport } from "./crm-calendar-write";
import type { ServiceFetcher } from "./sales-ops";

test("EMP-002 calendar write persists through AG-002 and is readable back from CRM", async () => {
  const stored = new Map<string, Record<string, unknown>>();
  let nextId = 9001;
  const service: ServiceFetcher = {
    async fetch(input, init) {
      const url = new URL(String(input));
      assert.equal(url.pathname, "/api/agent");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("X-Tenant-ID"), "herreb-client-0");
      assert.equal(headers.get("X-HerreB-Runtime-Token"), "runtime-secret");

      if (init?.method === "POST") {
        assert.ok(headers.get("Idempotency-Key"));
        const body = JSON.parse(String(init.body)) as { operation: string; entity: string; payload: Record<string, unknown> };
        assert.equal(body.operation, "create");
        assert.equal(body.entity, "tasks");
        const id = String(nextId++);
        const record = {
          id,
          ...body.payload,
          calendarEventId: "gcal-e2e-9001",
          calendarSyncStatus: "SYNCED",
          persistenceConfirmed: true,
        };
        stored.set(id, record);
        return Response.json({ ok: true, data: record, persistenceConfirmed: true }, { status: 200 });
      }

      const id = url.searchParams.get("id");
      const data = id ? (stored.has(id) ? [stored.get(id)] : []) : [...stored.values()];
      return Response.json({ entity: "tasks", data, pagination: { hasMore: false } }, { status: 200 });
    },
  };

  const writeCrm = createAg002GatewayControlledWriteTransport({
    service,
    runtimeToken: "runtime-secret",
    tenantId: "herreb-client-0",
  });
  const calendar = createCrmCalendarControlledWriteTransport(writeCrm);
  const correlationId = "emp002-e2e-calendar-9001";
  const write = await calendar.execute({
    tenantId: "herreb-client-0",
    correlationId,
    idempotencyKey: "emp002-e2e:create:9001",
    request: {
      operation: "create",
      title: "EMP-002 E2E certification",
      startTime: "2026-10-05T15:00:00-03:00",
      endTime: "2026-10-05T16:00:00-03:00",
      timezone: "America/Asuncion",
      attendees: ["certification@example.invalid"],
      description: "Temporary EMP-002 certification record",
    },
  });

  assert.equal(write.ok, true);
  assert.equal(write.evidence?.upstreamStatus, 200);
  assert.equal(write.evidence?.transport, "AG002_GATEWAY_CONTROLLED_WRITE");
  assert.equal(write.evidence?.source, "HERREB_CRM");
  assert.equal(write.evidence?.googleAccessedByEmployeeCore, false);

  const writeOutput = write.output as { data?: { id?: string }; persistenceConfirmed?: boolean };
  assert.equal(writeOutput.persistenceConfirmed, true);
  const id = writeOutput.data?.id;
  assert.ok(id);

  const readCrm = createAg002GatewayReadOnlyTransport({
    service,
    runtimeToken: "runtime-secret",
    tenantId: "herreb-client-0",
  });
  const readBack = await readCrm.execute({
    tenantId: "herreb-client-0",
    operation: "read",
    entity: "tasks",
    payload: { id },
    correlationId: `${correlationId}:readback`,
  });

  assert.equal(readBack.ok, true);
  assert.equal(readBack.evidence?.upstreamStatus, 200);
  const readOutput = readBack.output as { data?: Array<Record<string, unknown>> };
  assert.equal(readOutput.data?.length, 1);
  const record = readOutput.data?.[0];
  assert.equal(record?.id, id);
  assert.equal(record?.title, "EMP-002 E2E certification");
  assert.equal(record?.calendarEventId, "gcal-e2e-9001");
  assert.equal(record?.calendarSyncStatus, "SYNCED");
  assert.equal(record?.persistenceConfirmed, true);
});
