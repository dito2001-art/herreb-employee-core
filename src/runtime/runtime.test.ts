import assert from "node:assert/strict";
import test from "node:test";
import {
  StaticModelRouter,
  parseTenantManifest,
  type CapabilityAdapter,
  type CapabilityRequest,
  type CapabilityResult
} from "../core";
import { buildEmployeeSystemPrompt, HerreBEmployeeRuntime } from "./index";

const crmReadAdapter: CapabilityAdapter = {
  id: "runtime-test-crm-read",
  capabilities: ["crm.read"],
  employees: ["EMP-001", "EMP-002", "EMP-003"],
  async execute(request: CapabilityRequest): Promise<CapabilityResult> {
    return {
      ok: true,
      output: { tenantId: request.context.tenantId, input: request.input },
      evidence: { source: "test-adapter" }
    };
  }
};

const crmWriteAdapter: CapabilityAdapter = {
  id: "runtime-test-crm-write",
  capabilities: ["crm.write"],
  employees: ["EMP-002"],
  async execute(request: CapabilityRequest): Promise<CapabilityResult> {
    return {
      ok: true,
      output: { tenantId: request.context.tenantId, input: request.input },
      evidence: { source: "test-write-adapter" }
    };
  }
};

const modelRouter = new StaticModelRouter({
  provider: "test-provider",
  model: "test-model",
  reason: "runtime contract test"
});

test("runtime starts only one of the three declared employees", async () => {
  const runtime = new HerreBEmployeeRuntime({
    modelRouter,
    adapters: [crmReadAdapter]
  });
  const session = await runtime.start({
    tenantId: "tenant-a",
    employeeId: "EMP-002",
    workspaceId: "workspace-1",
    actorId: "fernando",
    channel: "test",
    correlationId: "corr-1"
  });
  assert.equal(session.manifest.id, "EMP-002");
  assert.equal(session.modelRoute.provider, "test-provider");

  await assert.rejects(
    runtime.start({
      tenantId: "tenant-a",
      employeeId: "EMP-004",
      workspaceId: "workspace-1",
      actorId: "fernando",
      channel: "test"
    }),
    /Invalid option/
  );
});

test("runtime enforces tenant employee entitlements before model routing", async () => {
  const runtime = new HerreBEmployeeRuntime({
    modelRouter,
    adapters: [crmReadAdapter],
    resolveTenantManifest: (tenantId) =>
      parseTenantManifest({
        tenantId,
        enabledEmployees: ["EMP-003"],
        knowledgeNamespace: `${tenantId}:knowledge`,
        offeringNamespace: `${tenantId}:offerings`
      })
  });

  const marketer = await runtime.start({
    tenantId: "client-a",
    employeeId: "EMP-003",
    workspaceId: "marketing",
    actorId: "owner",
    channel: "test"
  });
  assert.equal(marketer.tenantManifest?.tenantId, "client-a");

  await assert.rejects(
    runtime.start({
      tenantId: "client-a",
      employeeId: "EMP-001",
      workspaceId: "sales",
      actorId: "owner",
      channel: "test"
    }),
    /EMPLOYEE_NOT_ENTITLED/
  );
});

test("runtime rejects a tenant manifest resolved for another tenant", async () => {
  const runtime = new HerreBEmployeeRuntime({
    modelRouter,
    resolveTenantManifest: () =>
      parseTenantManifest({
        tenantId: "tenant-b",
        enabledEmployees: ["EMP-002"],
        knowledgeNamespace: "tenant-b:knowledge",
        offeringNamespace: "tenant-b:offerings"
      })
  });
  await assert.rejects(
    runtime.start({
      tenantId: "tenant-a",
      employeeId: "EMP-002",
      workspaceId: "assistant",
      actorId: "owner",
      channel: "test"
    }),
    /TENANT_MANIFEST_MISMATCH/
  );
});

test("runtime preserves tenant boundary in capability execution", async () => {
  const runtime = new HerreBEmployeeRuntime({
    modelRouter,
    adapters: [crmReadAdapter]
  });
  const a = await runtime.start({
    tenantId: "tenant-a",
    employeeId: "EMP-002",
    workspaceId: "w",
    actorId: "a",
    channel: "test",
    correlationId: "a-1"
  });
  const b = await runtime.start({
    tenantId: "tenant-b",
    employeeId: "EMP-002",
    workspaceId: "w",
    actorId: "b",
    channel: "test",
    correlationId: "b-1"
  });
  const ra = await a.execute("crm.read", { query: "x" });
  const rb = await b.execute("crm.read", { query: "x" });
  assert.equal((ra.output as { tenantId: string }).tenantId, "tenant-a");
  assert.equal((rb.output as { tenantId: string }).tenantId, "tenant-b");
});

test("runtime blocks capabilities outside employee manifest before adapter execution", async () => {
  const runtime = new HerreBEmployeeRuntime({
    modelRouter,
    adapters: [crmReadAdapter]
  });
  const session = await runtime.start({
    tenantId: "tenant-a",
    employeeId: "EMP-002",
    workspaceId: "w",
    actorId: "a",
    channel: "test"
  });
  await assert.rejects(
    session.execute("offering.read", {}),
    /EMPLOYEE_CAPABILITY_NOT_DECLARED/
  );
});

test("runtime refuses controlled write when identity is only claimed", async () => {
  const runtime = new HerreBEmployeeRuntime({
    modelRouter,
    adapters: [crmWriteAdapter]
  });
  const session = await runtime.start({
    tenantId: "tenant-a",
    employeeId: "EMP-002",
    workspaceId: "assistant",
    actorId: "fernando",
    channel: "test"
  });
  assert.equal(session.provenance.assurance, "UNVERIFIED");
  const result = await session.execute(
    "crm.write",
    { operation: "update" },
    { approvalGranted: true, idempotencyKey: "crm:update:1" }
  );
  assert.equal(result.error?.code, "VERIFIED_AUTHORIZATION_REQUIRED");
});

test("runtime permits controlled write only for matching owner-verified provenance", async () => {
  const runtime = new HerreBEmployeeRuntime({
    modelRouter,
    adapters: [crmWriteAdapter],
    resolveProvenance: (_input, context) => ({
      assurance: "OWNER_VERIFIED",
      subjectId: context.actorId,
      tenantId: context.tenantId,
      source: "trusted-authenticator"
    })
  });
  const session = await runtime.start({
    tenantId: "tenant-a",
    employeeId: "EMP-002",
    workspaceId: "assistant",
    actorId: "fernando",
    channel: "test"
  });
  const result = await session.execute(
    "crm.write",
    { operation: "update" },
    { approvalGranted: true, idempotencyKey: "crm:update:2" }
  );
  assert.equal(result.ok, true);
  assert.equal(result.audit.evidence?.authorizationAssurance, "OWNER_VERIFIED");
  assert.equal(result.audit.evidence?.authorizationSubjectId, "fernando");
  assert.equal(result.audit.evidence?.authorizationTenantId, "tenant-a");
});

for (const scenario of [
  {
    name: "service verification",
    assurance: "SERVICE_VERIFIED" as const,
    subjectId: "fernando",
    tenantId: "tenant-a"
  },
  {
    name: "owner verification for another tenant",
    assurance: "OWNER_VERIFIED" as const,
    subjectId: "fernando",
    tenantId: "tenant-b"
  },
  {
    name: "owner verification for another actor",
    assurance: "OWNER_VERIFIED" as const,
    subjectId: "other",
    tenantId: "tenant-a"
  }
]) {
  test(`runtime refuses controlled write with ${scenario.name}`, async () => {
    const runtime = new HerreBEmployeeRuntime({
      modelRouter,
      adapters: [crmWriteAdapter],
      resolveProvenance: () => ({
        assurance: scenario.assurance,
        subjectId: scenario.subjectId,
        tenantId: scenario.tenantId,
        source: "trusted-authenticator"
      })
    });
    const session = await runtime.start({
      tenantId: "tenant-a",
      employeeId: "EMP-002",
      workspaceId: "assistant",
      actorId: "fernando",
      channel: "test"
    });
    const result = await session.execute(
      "crm.write",
      { operation: "update" },
      {
        approvalGranted: true,
        idempotencyKey: `crm:update:${scenario.name}`
      }
    );
    assert.equal(result.error?.code, "VERIFIED_AUTHORIZATION_REQUIRED");
  });
}

test("manifest-driven prompt carries tenant and evidence rules", async () => {
  const runtime = new HerreBEmployeeRuntime({ modelRouter });
  const session = await runtime.start({
    tenantId: "tenant-a",
    employeeId: "EMP-001",
    workspaceId: "sales",
    actorId: "a",
    channel: "test"
  });
  const prompt = buildEmployeeSystemPrompt(session.context, session.manifest);
  assert.match(prompt, /EMP-001 AI Sales Rep/);
  assert.match(prompt, /Tenant: tenant-a/);
  assert.match(prompt, /Do not claim a side effect happened/);
});
