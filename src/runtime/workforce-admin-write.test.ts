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

test("tenant owner cannot create tenants even with approval", async () => {
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
    randomId: () => "audit-4"
  });
  assert.equal(blocked.decision, "RED");
  assert.equal(approved.decision, "RED");
  assert.equal(approved.persisted, false);
  assert.equal(h.getState().manifests.length, 1);
});


test("tenant owner cannot delete an identity without tenant-scoped lookup", async () => {
  const h = harness();
  const result = await executeWorkforceAdminMutation({
    actor: owner,
    mutation: { type: "identity.delete", email: "owner@herreb.test" },
    store: h.store,
    audit: h.audit,
    randomId: () => "audit-delete"
  });
  assert.equal(result.decision, "RED");
  assert.equal(result.persisted, false);
  assert.equal(h.getState().identities.length, 1);
  assert.equal(h.audits.length, 1);
});

test("platform administrator requires YELLOW approval to create a tenant", async () => {
  const h = harness();
  const actor = { actorId: "platform", tenantId: "platform", role: "platform_admin" as const };
  const mutation = {
    type: "tenant.create" as const,
    tenant: { tenantId: "pilot", name: "Pilot", enabledEmployees: ["EMP-002" as const], knowledgeNamespace: "pilot:k", offeringNamespace: "pilot:o" }
  };
  const blocked = await executeWorkforceAdminMutation({ actor, mutation, store: h.store, audit: h.audit, randomId: () => "platform-1" });
  assert.equal(blocked.decision, "YELLOW");
  assert.equal(blocked.persisted, false);
  const approved = await executeWorkforceAdminMutation({ actor, mutation, store: h.store, audit: h.audit, randomId: () => "platform-2" });
  assert.equal(approved.decision, "YELLOW");
  assert.equal(approved.persisted, true);
  assert.equal(h.getState().manifests.length, 2);
});

test("tenant owner cannot modify another tenant while platform administrator can", async () => {
  const h = harness();
  const mutation = { type: "tenant.employees.set" as const, tenantId: "other", enabledEmployees: ["EMP-001" as const] };
  const denied = await executeWorkforceAdminMutation({ actor: owner, mutation, store: h.store, audit: h.audit, randomId: () => "scope-1" });
  assert.equal(denied.decision, "RED");
  const platform = new (await import("./workforce-admin-write")).OwnerScopedAdminPolicy();
  assert.equal(platform.evaluate({ actorId: "platform", tenantId: "platform", role: "platform_admin" }, mutation), "GREEN");
});

test("owner cannot take over an existing identity from another tenant; denial is audited", async () => {
  const h = harness();
  const otherOwner = { actorId: "other-owner", tenantId: "other", role: "owner" as const };
  const denied = await executeWorkforceAdminMutation({
    actor: otherOwner,
    mutation: { type: "identity.upsert", identity: { email: "OWNER@HERREB.TEST", tenantId: "other", actorId: "stolen", role: "owner" } },
    store: h.store,
    audit: h.audit,
    randomId: () => "takeover-denied"
  });
  assert.equal(denied.decision, "RED");
  assert.equal(denied.persisted, false);
  assert.equal(h.getState().identities[0]?.tenantId, "herreb");
  assert.equal(h.getState().identities[0]?.actorId, "owner");
  assert.equal(h.audits[0]?.decision, "RED");
  assert.equal(h.audits[0]?.persisted, false);
});

test("YELLOW write cannot be self-approved with a caller-controlled boolean", async () => {
  const h = harness();
  const actor = { actorId: "platform", tenantId: "platform", role: "platform_admin" as const };
  const result = await executeWorkforceAdminMutation({
    actor,
    mutation: { type: "tenant.create", tenant: { tenantId: "blocked-pilot", name: "Blocked", enabledEmployees: ["EMP-002"], knowledgeNamespace: "k", offeringNamespace: "o" } },
    store: h.store,
    audit: h.audit,
    // A caller-controlled approval flag must not authorize YELLOW persistence.
    ...({ approveYellow: true } as object),
    randomId: () => "yellow-no-self-approval"
  });
  assert.equal(result.decision, "YELLOW");
  assert.equal(result.persisted, false);
  assert.equal(h.getState().manifests.length, 1);
  assert.equal(h.audits[0]?.persisted, false);
});
