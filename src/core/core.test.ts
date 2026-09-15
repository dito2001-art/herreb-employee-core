import assert from "node:assert/strict";
import test from "node:test";
import {
  assertEmployeeEntitled,
  assertKnowledgeTenant,
  assertSameTenant,
  authorizeCapability,
  canUseAsVerifiedClaim,
  createAdapterRegistry,
  executeCapability,
  getEmployeeManifest,
  KnowledgeRecordSchema,
  parseTenantContext,
  parseTenantManifest,
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

test("tenant manifests allow employees to be sold separately or together", () => {
  const marketerOnly = parseTenantManifest({
    tenantId: "tenant-marketing",
    enabledEmployees: ["EMP-003"],
    knowledgeNamespace: "tenant-marketing:knowledge",
    offeringNamespace: "tenant-marketing:offerings"
  });
  assert.doesNotThrow(() => assertEmployeeEntitled(marketerOnly, "EMP-003"));
  assert.throws(
    () => assertEmployeeEntitled(marketerOnly, "EMP-001"),
    /EMPLOYEE_NOT_ENTITLED/
  );

  const workforce = parseTenantManifest({
    tenantId: "herreb",
    enabledEmployees: ["EMP-001", "EMP-002", "EMP-003"],
    knowledgeNamespace: "herreb:knowledge",
    offeringNamespace: "herreb:offerings"
  });
  assert.doesNotThrow(() => assertEmployeeEntitled(workforce, "EMP-001"));
  assert.doesNotThrow(() => assertEmployeeEntitled(workforce, "EMP-002"));
  assert.doesNotThrow(() => assertEmployeeEntitled(workforce, "EMP-003"));
});

test("tenant knowledge is isolated and only verified canonical facts support claims", () => {
  const canonical = KnowledgeRecordSchema.parse({
    id: "knowledge-1",
    tenantId: "tenant-a",
    namespace: "tenant-a:knowledge",
    kind: "CANONICAL",
    subject: "offering:implant-x",
    content: { claim: "Approved product claim" },
    sourceRefs: ["product-sheet-1"],
    confidence: 1,
    verified: true,
    updatedAt: "2026-09-15T00:00:00Z"
  });
  assert.doesNotThrow(() => assertKnowledgeTenant("tenant-a", canonical));
  assert.throws(
    () => assertKnowledgeTenant("tenant-b", canonical),
    /KNOWLEDGE_TENANT_ISOLATION_VIOLATION/
  );
  assert.equal(canUseAsVerifiedClaim(canonical), true);

  const learned = KnowledgeRecordSchema.parse({
    ...canonical,
    id: "knowledge-2",
    kind: "LEARNED",
    verified: true
  });
  assert.equal(canUseAsVerifiedClaim(learned), false);
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
  assert.equal(
    approvalOnly.error?.code,
    "VERIFIED_AUTHORIZATION_REQUIRED"
  );
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
