import assert from "node:assert/strict";
import test from "node:test";
import { createAdapterRegistry } from "../core/adapters";
import type { TenantContext } from "../core/contracts";
import { executeCapability } from "../core/executor";
import { createEmp001WhatsAppAdapter } from "./emp001-whatsapp";

const context: TenantContext = {
  tenantId: "tenant-a",
  employeeId: "EMP-001",
  workspaceId: "sales",
  actorId: "owner",
  channel: "runtime",
  correlationId: "corr-whatsapp"
};

test("EMP001 WhatsApp adapter propagates tenant correlation and idempotency", async () => {
  let captured:
    | {
        tenantId: string;
        correlationId: string;
        idempotencyKey: string;
        leadId: string;
        to: string;
      }
    | undefined;
  const registry = createAdapterRegistry();
  registry.register(
    createEmp001WhatsAppAdapter({
      async send(input) {
        captured = input;
        return {
          ok: true,
          output: { messageId: "wamid.mock", provider: "mock", status: "SENT" }
        };
      }
    })
  );

  const result = await executeCapability(
    registry,
    {
      context,
      capabilityId: "whatsapp.send",
      input: { leadId: "lead-1", contactKey: "595981000000" },
      idempotencyKey: "emp001:tenant-a:outreach:lead-1:whatsapp"
    },
    {
      approvalGranted: true,
      controlledWriteAuthorization: {
        authorized: true,
        tenantId: "tenant-a",
        subjectId: "owner",
        assurance: "test",
        source: "trusted-test"
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(captured?.tenantId, "tenant-a");
  assert.equal(captured?.correlationId, "corr-whatsapp");
  assert.equal(
    captured?.idempotencyKey,
    "emp001:tenant-a:outreach:lead-1:whatsapp"
  );
  assert.equal(captured?.to, "595981000000");
});

test("EMP001 WhatsApp adapter is never reached without controlled-write authorization", async () => {
  let calls = 0;
  const registry = createAdapterRegistry();
  registry.register(
    createEmp001WhatsAppAdapter({
      async send() {
        calls += 1;
        return { ok: true };
      }
    })
  );

  const result = await executeCapability(registry, {
    context,
    capabilityId: "whatsapp.send",
    input: { leadId: "lead-1", contactKey: "595981000000" },
    idempotencyKey: "emp001:tenant-a:outreach:lead-1:whatsapp"
  });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "APPROVAL_REQUIRED");
  assert.equal(calls, 0);
});
