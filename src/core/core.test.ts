import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSameTenant,
  authorizeCapability,
  createAdapterRegistry,
  executeCapability,
  getEmployeeManifest,
  parseTenantContext,
  tenantScopedKey,
  type CapabilityAdapter
} from "./index";

const baseContext = parseTenantContext({
  tenantId: "tenant-a",
  employeeId: "EMP-001",
  workspaceId: "workspace-1",
  actorId: "fernando",
  channel: "test",
  correlationId: "run-1"
});

test("the v1 employee manifests are exactly the three approved products", () => {
  assert.equal(getEmployeeManifest("EMP-001").id, "EMP-001");
  assert.equal(getEmployeeManifest("EMP-002").id, "EMP-002");
  assert.equal(getEmployeeManifest("EMP-003").id, "EMP-003");
});

test("tenant context rejects unsupported employees", () => {
  assert.throws(() =>
    parseTenantContext({ ...baseContext, employeeId: "EMP-004" })
  );
});

test("tenant isolation rejects cross-tenant resources", () => {
  assert.doesNotThrow(() => assertSameTenant(baseContext, "tenant-a"));
  assert.throws(
    () => assertSameTenant(baseContext, "tenant-b"),
    /TENANT_ISOLATION_VIOLATION/
  );
});

test("tenant scoped keys include and safely encode tenant employee workspace and resource", () => {
  assert.equal(
    tenantScopedKey(baseContext, "conversation:123"),
    "tenant-a:EMP-001:workspace-1:conversation%3A123"
  );
  assert.notEqual(
    tenantScopedKey(
      { ...baseContext, tenantId: "tenant:b" },
      "conversation:123"
    ),
    tenantScopedKey(
      { ...baseContext, tenantId: "tenant" },
      "b:conversation:123"
    )
  );
});

test("policy is deny-by-default and employee boundaries are enforced", () => {
  assert.equal(
    authorizeCapability(baseContext, "unknown.capability").decision,
    "DENY"
  );
  assert.equal(
    authorizeCapability(baseContext, "calendar.read").decision,
    "DENY"
  );
});

test("adapter registry rejects unknown capabilities and invalid employee scopes", () => {
  const registry = createAdapterRegistry();
  assert.throws(() =>
    registry.register({
      id: "unknown",
      capabilities: ["unknown.capability"],
      employees: ["EMP-001"],
      async execute() {
        return { ok: true };
      }
    })
  );
  assert.throws(() =>
    registry.register({
      id: "wrong-employee",
      capabilities: ["calendar.read"],
      employees: ["EMP-001"],
      async execute() {
        return { ok: true };
      }
    })
  );
});

test("green capability executes without approval", async () => {
  const registry = createAdapterRegistry();
  const adapter: CapabilityAdapter = {
    id: "test-offering",
    capabilities: ["offering.read"],
    employees: ["EMP-001"],
    async execute() {
      return {
        ok: true,
        output: { offerings: [] },
        evidence: { adapter: "test-offering" }
      };
    }
  };
  registry.register(adapter);
  const result = await executeCapability(registry, {
    context: baseContext,
    capabilityId: "offering.read",
    input: {}
  });
  assert.equal(result.ok, true);
  assert.equal(result.audit.decision, "ALLOW");
  assert.equal(result.audit.tenantId, "tenant-a");
});

test("yellow capability requires idempotency and explicit approval", async () => {
  const registry = createAdapterRegistry();
  registry.register({
    id: "test-quote",
    capabilities: ["quote.create"],
    employees: ["EMP-001"],
    async execute() {
      return { ok: true, output: { quoteId: "Q-1" } };
    }
  });
  const missingKey = await executeCapability(registry, {
    context: baseContext,
    capabilityId: "quote.create",
    input: {}
  });
  assert.equal(missingKey.error?.code, "IDEMPOTENCY_KEY_REQUIRED");
  const blocked = await executeCapability(registry, {
    context: baseContext,
    capabilityId: "quote.create",
    input: {},
    idempotencyKey: "quote:run-1"
  });
  assert.equal(blocked.error?.code, "APPROVAL_REQUIRED");
  const approved = await executeCapability(
    registry,
    {
      context: baseContext,
      capabilityId: "quote.create",
      input: {},
      idempotencyKey: "quote:run-1"
    },
    { approvalGranted: true }
  );
  assert.equal(approved.ok, true);
  assert.equal(approved.audit.evidence?.approvalGranted, true);
  assert.equal(approved.audit.evidence?.idempotencyKey, "quote:run-1");
});
