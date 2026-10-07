import assert from "node:assert/strict";
import test from "node:test";
import { createCrmCapabilityReadOnlyTransport } from "./crm-capability";

test("CRM task reads forward supported filters and consume every page", async () => {
  const urls: URL[] = [];
  const service = {
    async fetch(input: RequestInfo | URL) {
      const url = new URL(String(input));
      urls.push(url);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const data = offset === 0
        ? [{ id: 202, startDate: "2026-10-08" }]
        : [{ id: 101, startDate: "2026-10-08" }];
      return Response.json({
        entity: "tasks",
        data,
        pagination: {
          limit: 1,
          offset,
          returned: 1,
          total: 2,
          hasMore: offset === 0,
          nextOffset: offset === 0 ? 1 : null
        }
      });
    }
  };

  const transport = createCrmCapabilityReadOnlyTransport({
    service,
    runtimeToken: "test-token",
    tenantId: "herreb-client-0"
  });
  const result = await transport.execute({
    tenantId: "herreb-client-0",
    operation: "read",
    entity: "tasks",
    payload: { from: "2026-10-08", to: "2026-10-08", limit: 1, offset: 0 },
    correlationId: "corr-readback"
  });

  assert.equal(result.ok, true);
  assert.equal(urls.length, 2);
  assert.equal(urls[0].searchParams.get("from"), "2026-10-08");
  assert.equal(urls[0].searchParams.get("to"), "2026-10-08");
  assert.equal(urls[0].searchParams.get("limit"), "1");
  assert.equal(urls[0].searchParams.get("offset"), "0");
  assert.equal(urls[1].searchParams.get("offset"), "1");
  const output = result.output as { data: Array<{ id: number }>; pagination: { hasMore: boolean } };
  assert.deepEqual(output.data.map((row) => row.id), [202, 101]);
  assert.equal(output.pagination.hasMore, false);
});

test("CRM non-task reads remain single-page but forward safe filters", async () => {
  let seen: URL | undefined;
  const service = {
    async fetch(input: RequestInfo | URL) {
      seen = new URL(String(input));
      return Response.json({ entity: "opportunities", data: [], pagination: { hasMore: false } });
    }
  };
  const transport = createCrmCapabilityReadOnlyTransport({ service, runtimeToken: "test-token", tenantId: "herreb-client-0" });
  const result = await transport.execute({
    tenantId: "herreb-client-0",
    operation: "read",
    entity: "opportunities",
    payload: { status: "Ganado" },
    correlationId: "corr-safe-filter"
  });
  assert.equal(result.ok, true);
  assert.equal(seen?.searchParams.get("status"), "Ganado");
  assert.equal(seen?.searchParams.has("limit"), false);
});
