import assert from "node:assert/strict";
import test from "node:test";
import { executeCapability, parseTenantContext } from "../core";
import { createAdapterRegistry } from "../core/adapters";
import { createCrmAdapter } from "./crm";
import { createSalesOpsAdapter } from "./sales-ops";

const salesContext = parseTenantContext({
  tenantId: "tenant-a",
  employeeId: "EMP-001",
  workspaceId: "sales",
  actorId: "tester",
  channel: "test",
  correlationId: "corr-sales"
});

test("Sales Ops adapter propagates tenant and maps products to offerings", async () => {
  let tenantHeader = "";
  const service = {
    async fetch(_input: RequestInfo | URL, init?: RequestInit) {
      tenantHeader = new Headers(init?.headers).get("X-Tenant-ID") ?? "";
      return new Response(
        JSON.stringify({
          ok: true,
          products: [
            { sku: "SKU-1", name: "Demo", price: 100, currency: "PYG", stock: 2 }
          ]
        }),
        { status: 200 }
      );
    }
  };

  const registry = createAdapterRegistry();
  registry.register(createSalesOpsAdapter({ service, token: "test-token" }));
  const result = await executeCapability(registry, {
    context: salesContext,
    capabilityId: "offering.read",
    input: {}
  });

  assert.equal(result.ok, true);
  assert.equal(tenantHeader, "tenant-a");
  const output = result.output as { offerings: Array<{ id: string; type: string }> };
  assert.equal(output.offerings[0]?.id, "SKU-1");
  assert.equal(output.offerings[0]?.type, "PHYSICAL_PRODUCT");
});

test("CRM adapter blocks entities outside the commercial allowlist", async () => {
  let calls = 0;
  const registry = createAdapterRegistry();
  registry.register(
    createCrmAdapter({
      async execute() {
        calls += 1;
        return { ok: true };
      }
    })
  );

  const result = await executeCapability(registry, {
    context: salesContext,
    capabilityId: "crm.read",
    input: { operation: "read", entity: "secrets" }
  });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "CRM_ENTITY_BLOCKED");
  assert.equal(calls, 0);
});

test("CRM write requires policy approval and idempotency", async () => {
  let calls = 0;
  const registry = createAdapterRegistry();
  registry.register(
    createCrmAdapter({
      async execute() {
        calls += 1;
        return { ok: true, output: { id: 140 } };
      }
    })
  );

  const request = {
    context: salesContext,
    capabilityId: "crm.write",
    input: { operation: "update" as const, entity: "tasks", payload: { id: 140 } },
    idempotencyKey: "task-140-update-1"
  };

  const blocked = await executeCapability(registry, request);
  assert.equal(blocked.error?.code, "APPROVAL_REQUIRED");
  assert.equal(calls, 0);

  const approved = await executeCapability(registry, request, { approvalGranted: true });
  assert.equal(approved.ok, true);
  assert.equal(calls, 1);
});
