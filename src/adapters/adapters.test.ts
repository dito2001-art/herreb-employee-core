import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdapterRegistry,
  executeCapability,
  parseTenantContext
} from "../core";
import { createCrmAdapter } from "./crm";
import { createSalesOpsAdapter } from "./sales-ops";

const salesContext = parseTenantContext({
  tenantId: "tenant-a",
  employeeId: "EMP-001",
  workspaceId: "sales",
  actorId: "fernando",
  channel: "test",
  correlationId: "corr-sales"
});

test("Sales Ops adapter propagates tenant and maps products to offerings", async () => {
  let seenTenant = "";
  let seenUrl = "";
  let seenMethod = "";
  const registry = createAdapterRegistry();
  registry.register(
    createSalesOpsAdapter({
      token: "test-token",
      service: {
        async fetch(input, init) {
          const request = new Request(input, init);
          seenTenant = request.headers.get("X-Tenant-ID") ?? "";
          seenUrl = request.url;
          seenMethod = request.method;
          return Response.json({
            products: [
              {
                id: "p-1",
                name: "Product 1",
                price: 10,
                currency: "USD"
              }
            ]
          });
        }
      }
    })
  );

  const result = await executeCapability(registry, {
    context: salesContext,
    capabilityId: "offering.read",
    input: {}
  });

  assert.equal(result.ok, true);
  assert.equal(seenTenant, "tenant-a");
  assert.equal(seenUrl, "https://sales-ops.internal/api/v1/products");
  assert.equal(seenMethod, "GET");
  const offerings = (result.output as { offerings: Array<{ type: string }> })
    .offerings;
  assert.equal(offerings[0]?.type, "PHYSICAL_PRODUCT");
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

test("CRM write requires policy approval idempotency and verified authorization", async () => {
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
    input: {
      operation: "update" as const,
      entity: "tasks",
      payload: { id: 140 }
    },
    idempotencyKey: "task-140-update-1"
  };

  const blocked = await executeCapability(registry, request);
  assert.equal(blocked.error?.code, "APPROVAL_REQUIRED");
  assert.equal(calls, 0);

  const approvalOnly = await executeCapability(registry, request, {
    approvalGranted: true
  });
  assert.equal(
    approvalOnly.error?.code,
    "VERIFIED_AUTHORIZATION_REQUIRED"
  );
  assert.equal(calls, 0);

  const approved = await executeCapability(registry, request, {
    approvalGranted: true,
    controlledWriteAuthorization: {
      authorized: true,
      assurance: "OWNER_VERIFIED",
      subjectId: "fernando",
      tenantId: "tenant-a",
      source: "trusted-authenticator"
    }
  });
  assert.equal(approved.ok, true);
  assert.equal(calls, 1);
});
