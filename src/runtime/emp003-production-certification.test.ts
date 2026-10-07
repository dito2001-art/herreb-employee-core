import assert from "node:assert/strict";
import test from "node:test";
import { runEMP003ProductionCertification } from "./emp003-production-certification";

test("EMP-003 production certification proves draft-only runtime and fail-closed research/publish", async () => {
  const result = await runEMP003ProductionCertification(
    {
      TENANT_MANIFESTS_JSON: JSON.stringify([{ tenantId: "herreb-client-0", enabledEmployees: ["EMP-001", "EMP-002", "EMP-003"], knowledgeNamespace: "herreb-client-0:knowledge", offeringNamespace: "herreb-client-0:offerings" }])
    },
    { tenantId: "herreb-client-0", actorId: "fernando", correlationId: "cert-emp003-1", brief: { objective: "Client0 certification" } },
    { async createDraft(input) { assert.equal(input.tenantId, "herreb-client-0"); assert.equal(input.correlationId, "cert-emp003-1"); return { draft: { text: "Client0 draft" }, evidenceRefs: [] }; } }
  );

  assert.equal(result.ok, true);
  assert.equal(result.tenantId, "herreb-client-0");
  assert.equal(result.employeeId, "EMP-003");
  assert.equal(result.contentCreateConnected, true);
  assert.equal(result.researchWebConnected, false);
  assert.equal(result.contentPublishConnected, false);
  assert.equal(result.status, "DRAFT");
  assert.equal(result.publishExecuted, false);
  assert.deepEqual(result.draft, { text: "Client0 draft" });
});
