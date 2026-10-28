import assert from "node:assert/strict";
import { test } from "node:test";
import { createSalesOpsAdapter } from "./sales-ops";
import { parseTenantContext } from "../core";
const context = parseTenantContext({
  tenantId: "tenant-a",
  employeeId: "EMP-001",
  workspaceId: "sales",
  actorId: "owner",
  channel: "test",
  correlationId: "one"
});
test("order operation is stable across retries and distinct across tenants", async () => {
  const payloads: Array<{ operation_id: string; quote_id: string }> = [];
  const adapter = createSalesOpsAdapter({
    token: "test",
    service: {
      async fetch(_url, init) {
        payloads.push(JSON.parse(String(init?.body)));
        return Response.json({ ok: true, order: { id: "order" } });
      }
    }
  });
  for (const tenant of ["tenant-a", "tenant-a", "tenant-b"])
    await adapter.execute({
      context: { ...context, tenantId: tenant },
      capabilityId: "sale.progress",
      input: { quoteId: "quote" }
    });
  assert.equal(payloads[0].operation_id, payloads[1].operation_id);
  assert.notEqual(payloads[0].operation_id, payloads[2].operation_id);
  assert.equal(payloads[0].quote_id, "quote");
});
test("catalog maps authoritative Gs prices, inventory and inactive products", async () => {
  const adapter = createSalesOpsAdapter({
    token: "test",
    service: {
      async fetch() {
        return Response.json({
          products: [
            {
              sku: "SKU",
              name: "Product",
              price_gs: 10000,
              stock_qty: 7,
              active: 0
            }
          ]
        });
      }
    }
  });
  const result = await adapter.execute({
    context,
    capabilityId: "offering.read",
    input: {}
  });
  assert.equal(result.ok, true);
  const output = result.output as {
    offerings: Array<{
      price: number;
      currency: string;
      active: boolean;
      metadata: { stock: number };
    }>;
  };
  assert.equal(output.offerings[0].price, 10000);
  assert.equal(output.offerings[0].currency, "PYG");
  assert.equal(output.offerings[0].active, false);
  assert.equal(output.offerings[0].metadata.stock, 7);
});
