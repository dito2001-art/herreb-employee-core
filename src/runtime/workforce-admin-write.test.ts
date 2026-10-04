import assert from "node:assert/strict";
import test from "node:test";
import type { WorkforceAdminMutationPlan } from "../core/workforce-admin-mutations";
import { executeWorkforceAdminMutation } from "./workforce-admin-write";

function harness() {
  let state: WorkforceAdminMutationPlan = {
    manifests: [
      {
        tenantId: "herreb",
        name: "HerreB",
        enabledEmployees: ["EMP-002"],
        knowledgeNamespace: "herreb:k",
        offeringNamespace: "herreb:o"
      }
    ],
    identities: [
      {
        email: "owner@herreb.test",
        tenantId: "herreb",
        actorId: "owner",
        role: "owner"
      }
    ]
  };
  const audits: Array<Record<string, unknown>> = [];
  return {
    store: {
      async read() {
        return state;
      },
      async write(next: WorkforceAdminMutationPlan) {
        state = next;
      }
    },
    audit: {
      async append(entry: Record<string, unknown>) {
        audits.push(entry);
      }
    },
    getState: () => state,
    audits
  };
}

const owner = {
  actorId: "owner",
  tenantId: "herreb",
  role: "owner" as const
};

test("GREEN mutation persists and emits audit evidence", async () => {
  const h = harness();
  const result = await executeWorkforceAdminMutation({
    actor: owner,
    mutation: {
      type: "tenant.employees.set",
      tenantId: "herreb",
      enabledEmployees: ["EMP-001", "EMP-002"]
    },
    store: h.store,
    audit: h.audit,
    randomId: () => "audit-1",
    now: () => new Date("2026-10-04T00:00:00Z")
  });
  assert.equal(result.persisted, true);
  assert.equal(result.decision, "GREEN");
  assert.deepEqual(h.getState().manifests[0]?.enabledEmployees, [
    "EMP-001",
    "EMP-002"
  ]);
  assert.equal(h.audits[0]?.auditId, "audit-1");
});

test("RED mutation never writes but is audited", async () => {
  const h = harness();
  const result = await executeWorkforceAdminMutation({
    actor: { actorId: "user", tenantId: "herreb", role: "user" },
    mutation: { type: "identity.delete", email: "owner@herreb.test" },
    store: h.store,
    audit: h.audit,
    randomId: () => "audit-2"
  });
  assert.equal(result.persisted, false);
  assert.equal(result.decision, "RED");
  assert.equal(h.getState().identities.length, 1);
  assert.equal(h.audits.length, 1);
});

test("YELLOW tenant creation requires explicit approval", async () => {
  const h = harness();
  const mutation = {
    type: "tenant.create" as const,
    tenant: {
      tenantId: "pilot",
      name: "Pilot",
      enabledEmployees: ["EMP-002" as const],
      knowledgeNamespace: "pilot:k",
      offeringNamespace: "pilot:o"
    }
  };
  const blocked = await executeWorkforceAdminMutation({
    actor: owner,
    mutation,
    store: h.store,
    audit: h.audit,
    randomId: () => "audit-3"
  });
  assert.equal(blocked.persisted, false);
  const approved = await executeWorkforceAdminMutation({
    actor: owner,
    mutation,
    store: h.store,
    audit: h.audit,
    approveYellow: true,
    randomId: () => "audit-4"
  });
  assert.equal(approved.persisted, true);
  assert.equal(h.getState().manifests.length, 2);
});
