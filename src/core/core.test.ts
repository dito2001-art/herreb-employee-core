import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPLOYEE_MANIFESTS,
  assertEmployeeEntitled,
  assertSameTenant,
  canUseAsVerifiedClaim,
  chooseDurableExecutionMode,
  createAdapterRegistry,
  createTenantManifest,
  executeCapability,
  getEmployeeManifest,
  isEmployeeEnabled,
  parseKnowledgeRecord,
  parseTenantContext,
  tenantScopedKey
} from "./index";

const baseContext = parseTenantContext({
  tenantId: "tenant-a",
  employeeId: "EMP-001",
  workspaceId: "sales",
  actorId: "fernando",
  channel: "test",
  correlationId: "corr-1"
});

test("the v1 employee manifests are exactly the three approved products", () => {
  assert.deepEqual(
    EMPLOYEE_MANIFESTS.map((manifest) => manifest.id),
    ["EMP-001", "EMP-002", "EMP-003"]
  );
  assert.equal(getEmployeeManifest("EMP-002").role, "AI Assistant");
});

test("tenant manifests allow employees to be sold separately or together", () => {
  const marketerOnly = createTenantManifest({
    tenantId: "tenant-marketing",
    enabledEmployees: ["EMP-003", "EMP-003"]
  });
  assert.deepEqual(marketerOnly.enabledEmployees, ["EMP-003"]);
  assert.equal(isEmployeeEnabled(marketerOnly, "EMP-003"), true);
  assert.equal(isEmployeeEnabled(marketerOnly, "EMP-001"), false);
  assert.throws(
    () => assertEmployeeEntitled(marketerOnly, "EMP-001"),
    /EMPLOYEE_NOT_ENTITLED/
  );

  const workforce = createTenantManifest({
    tenantId: "herreb-client-0",
    enabledEmployees: ["EMP-001", "EMP-002", "EMP-003"]
  });
  assert.deepEqual(workforce.enabledEmployees, [
    "EMP-001",
    "EMP-002",
    "EMP-003"
  ]);
  assert.equal(workforce.knowledgeNamespace, "tenant/herreb-client-0/knowledge");
  assert.equal(workforce.offeringNamespace, "tenant/herreb-client-0/offerings");
});

test("tenant knowledge is isolated and only verified canonical facts support claims", () => {
  const canonical = parseKnowledgeRecord({
    id: "k-1",
    tenantId: "tenant-a",
    kind: "CANONICAL",
    domain: "offering",
    content: "HerreB offers AI consulting",
    verified: true,
    sourceRefs: ["proposal-2026"]
  });
  const learned = parseKnowledgeRecord({
    id: "k-2",
    tenantId: "tenant-a",
    kind: "LEARNED",
    domain: "marketing",
    content: "Customers may prefer short copy",
    verified: true
  });
  assert.equal(canUseAsVerifiedClaim(canonical), true);
  assert.equal(canUseAsVerifiedClaim(learned), false);
  assert.throws(
    () =>
      assertSameTenant(
        baseContext,
        { tenantId: "tenant-b" },
        "knowledge"
      ),
    /TENANT_ISOLATION_VIOLATION/
  );
});

test("tenant context rejects unsupported employees", () => {
  assert.throws(
    () =>
      parseTenantContext({
        tenantId: "tenant-a",
        employeeId: "EMP-004",
        workspaceId: "x",
        actorId: "x",
        channel: "test",
        correlationId: "x"
      }),
    /Invalid option/
  );
});

test("tenant isolation rejects cross-tenant resources", () => {
  assert.throws(
    () => assertSameTenant(baseContext, { tenantId: "tenant-b" }, "record"),
    /TENANT_ISOLATION_VIOLATION/
  );
});

test("tenant scoped keys include and safely encode tenant employee workspace and resource", () => {
  assert.equal(
    tenantScopedKey(baseContext, "offerings/current"),
    "tenant-a:EMP-001:sales:offerings%2Fcurrent"
  );
});

test("policy is deny-by-default and employee boundaries are enforced", async () => {
  const registry = createAdapterRegistry();
  registry.register({
    id: "test-read",
    capabilities: ["crm.read"],
    employees: ["EMP-001"],
    async execute() {
      return { ok: true, output: { records: [] } };
    }
  });
  const allowed = await executeCapability(registry, {
    context: baseContext,
    capabilityId: "crm.read",
    input: {}
  });
  assert.equal(allowed.ok, true);

  const denied = await executeCapability(registry, {
    context: baseContext,
    capabilityId: "marketing.write",
    input: {}
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.error?.code, "CAPABILITY_NOT_ALLOWED");
});

test("adapter registry rejects unknown capabilities and invalid employee scopes", () => {
  const registry = createAdapterRegistry();
  assert.throws(
    () =>
      registry.register({
        id: "bad",
        capabilities: ["crm.read"],
        employees: ["EMP-003"],
        async execute() {
          return { ok: true };
        }
      }),
    /ADAPTER_EMPLOYEE_SCOPE_INVALID/
  );
});

test("green capability executes without approval", async () => {
  const registry = createAdapterRegistry();
  registry.register({
    id: "test-crm-read",
    capabilities: ["crm.read"],
    employees: ["EMP-001"],
    async execute() {
      return { ok: true, output: { records: [] } };
    }
  });
  const result = await executeCapability(registry, {
    context: baseContext,
    capabilityId: "crm.read",
    input: {}
  });
  assert.equal(result.ok, true);
  assert.equal(result.audit.outcome, "SUCCESS");
});

test("yellow capability requires idempotency approval and verified authorization", async () => {
  const registry = createAdapterRegistry();
  registry.register({
    id: "test-quote",
    capabilities: ["quote.create"],
    employees: ["EMP-001"],
    async execute() {
      return { ok: true, output: { quoteId: "Q-1" } };
    }
  });
  const request = {
    context: baseContext,
    capabilityId: "quote.create",
    input: {},
    idempotencyKey: "quote:run-1"
  };
  const missingKey = await executeCapability(registry, {
    ...request,
    idempotencyKey: undefined
  });
  assert.equal(missingKey.error?.code, "IDEMPOTENCY_KEY_REQUIRED");
  const blocked = await executeCapability(registry, request);
  assert.equal(blocked.error?.code, "APPROVAL_REQUIRED");
  const approvalOnly = await executeCapability(registry, request, {
    approvalGranted: true
  });
  assert.equal(approvalOnly.error?.code, "VERIFIED_AUTHORIZATION_REQUIRED");
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
  assert.equal(approved.audit.evidence?.approvalGranted, true);
  assert.equal(approved.audit.evidence?.idempotencyKey, "quote:run-1");
  assert.equal(
    approved.audit.evidence?.authorizationAssurance,
    "OWNER_VERIFIED"
  );
});

test("durable routing keeps simple future work on scheduler and complex work on workflows", () => {
  assert.equal(
    chooseDurableExecutionMode({
      employeeId: "EMP-002",
      capabilityId: "task.schedule",
      hasFutureTime: true
    }),
    "SCHEDULE"
  );
  assert.equal(
    chooseDurableExecutionMode({
      employeeId: "EMP-001",
      capabilityId: "quote.create",
      multiStep: true
    }),
    "WORKFLOW"
  );
});
