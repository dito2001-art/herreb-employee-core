import assert from "node:assert/strict";
import test from "node:test";
import type { CapabilityAdapter } from "./adapters";
import { createAdapterRegistry } from "./adapters";
import type { TenantContext } from "./contracts";
import { ProactiveSalesPolicySchema, type ProactiveSalesPolicy } from "./proactive-sales";
import {
  createInMemorySalesLoopExecutionStore,
  executeNextSalesLoopAction
} from "./sales-loop-executor";
import type { SalesLoopLead } from "./sales-loop";

const context: TenantContext = {
  tenantId: "tenant-a",
  employeeId: "EMP-001",
  workspaceId: "sales",
  actorId: "owner",
  channel: "runtime",
  correlationId: "corr-sales-loop"
};

function policy(overrides: Partial<ProactiveSalesPolicy> = {}): ProactiveSalesPolicy {
  return ProactiveSalesPolicySchema.parse({
    tenantId: "tenant-a",
    channels: ["WHATSAPP"],
    ...overrides
  });
}

function lead(overrides: Partial<SalesLoopLead> = {}): SalesLoopLead {
  return {
    id: "lead-1",
    tenantId: "tenant-a",
    source: "DATABASE",
    contactKey: "595981000000",
    qualified: true,
    ...overrides
  };
}

function registryWithWhatsApp(counter: { calls: number }) {
  const registry = createAdapterRegistry();
  const adapter: CapabilityAdapter = {
    id: "test-whatsapp",
    capabilities: ["whatsapp.send"],
    employees: ["EMP-001"],
    async execute() {
      counter.calls += 1;
      return { ok: true, evidence: { provider: "mock" } };
    }
  };
  registry.register(adapter);
  return registry;
}

test("yellow outreach fails closed without approval and verified authorization", async () => {
  const counter = { calls: 0 };
  const result = await executeNextSalesLoopAction({
    context,
    policy: policy(),
    leads: [lead()],
    registry: registryWithWhatsApp(counter),
    store: createInMemorySalesLoopExecutionStore()
  });

  assert.equal(result.decision.action, "OUTREACH");
  assert.equal(result.executed, false);
  assert.equal(result.reason, "APPROVAL_REQUIRED");
  assert.equal(counter.calls, 0);
});

test("authorized outreach executes once and duplicate is suppressed", async () => {
  const counter = { calls: 0 };
  const registry = registryWithWhatsApp(counter);
  const store = createInMemorySalesLoopExecutionStore();
  const executeOptions = {
    approvalGranted: true,
    controlledWriteAuthorization: {
      authorized: true,
      assurance: "test",
      subjectId: "owner",
      tenantId: "tenant-a",
      source: "trusted-test"
    }
  };

  const first = await executeNextSalesLoopAction({
    context,
    policy: policy(),
    leads: [lead()],
    registry,
    store,
    executeOptions
  });
  const second = await executeNextSalesLoopAction({
    context,
    policy: policy(),
    leads: [lead()],
    registry,
    store,
    executeOptions
  });

  assert.equal(first.executed, true);
  assert.equal(second.executed, false);
  assert.equal(second.reason, "DUPLICATE_SUPPRESSED");
  assert.equal(counter.calls, 1);
});

test("paused sales executes nothing", async () => {
  const counter = { calls: 0 };
  const result = await executeNextSalesLoopAction({
    context,
    policy: policy({ mode: "PAUSED" }),
    leads: [lead()],
    registry: registryWithWhatsApp(counter),
    store: createInMemorySalesLoopExecutionStore()
  });

  assert.equal(result.decision.action, "WAIT");
  assert.equal(result.executed, false);
  assert.equal(counter.calls, 0);
});

test("tenant mismatch executes nothing", async () => {
  const counter = { calls: 0 };
  const result = await executeNextSalesLoopAction({
    context,
    policy: policy({ tenantId: "tenant-b" }),
    leads: [lead()],
    registry: registryWithWhatsApp(counter),
    store: createInMemorySalesLoopExecutionStore()
  });

  assert.equal(result.decision.reason, "TENANT_MISMATCH");
  assert.equal(result.executed, false);
  assert.equal(counter.calls, 0);
});

test("opted-out lead is suppressed before contact", async () => {
  const counter = { calls: 0 };
  let suppressed = 0;
  const result = await executeNextSalesLoopAction({
    context,
    policy: policy(),
    leads: [lead({ optedOut: true })],
    registry: registryWithWhatsApp(counter),
    store: createInMemorySalesLoopExecutionStore(),
    safePorts: {
      async suppressLead() {
        suppressed += 1;
        return { ok: true };
      }
    }
  });

  assert.equal(result.decision.action, "SUPPRESS");
  assert.equal(result.executed, true);
  assert.equal(suppressed, 1);
  assert.equal(counter.calls, 0);
});

test("failed channel execution is not recorded as success", async () => {
  const registry = createAdapterRegistry();
  registry.register({
    id: "failing-whatsapp",
    capabilities: ["whatsapp.send"],
    employees: ["EMP-001"],
    async execute() {
      return {
        ok: false,
        error: { code: "UPSTREAM_FAILED", message: "mock failure" }
      };
    }
  });
  const store = createInMemorySalesLoopExecutionStore();
  const result = await executeNextSalesLoopAction({
    context,
    policy: policy(),
    leads: [lead()],
    registry,
    store,
    executeOptions: {
      approvalGranted: true,
      controlledWriteAuthorization: { authorized: true }
    }
  });

  assert.equal(result.executed, false);
  assert.equal(result.reason, "UPSTREAM_FAILED");
  assert.equal(await store.has(result.idempotencyKey ?? ""), false);
});
