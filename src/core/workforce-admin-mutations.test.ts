import assert from "node:assert/strict";
import test from "node:test";
import type { WorkforceAdminMutationPlan } from "./workforce-admin-mutations";
import { planWorkforceAdminMutation } from "./workforce-admin-mutations";

const base: WorkforceAdminMutationPlan = {
  manifests: [
    {
      tenantId: "herreb",
      name: "HerreB Client 0",
      enabledEmployees: ["EMP-001", "EMP-002"],
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

test("creates a tenant without mutating current state", () => {
  const next = planWorkforceAdminMutation(base, {
    type: "tenant.create",
    tenant: {
      tenantId: "pilot",
      name: "Pilot",
      enabledEmployees: ["EMP-002"],
      knowledgeNamespace: "pilot:k",
      offeringNamespace: "pilot:o"
    }
  });
  assert.equal(next.manifests.length, 2);
  assert.equal(base.manifests.length, 1);
});

test("sets only initial catalog employees", () => {
  const next = planWorkforceAdminMutation(base, {
    type: "tenant.employees.set",
    tenantId: "herreb",
    enabledEmployees: ["EMP-003"]
  });
  assert.deepEqual(next.manifests[0]?.enabledEmployees, ["EMP-003"]);
});

test("upserts normalized identity inside existing tenant", () => {
  const next = planWorkforceAdminMutation(base, {
    type: "identity.upsert",
    identity: {
      email: " TEAM@Herreb.Test ",
      tenantId: "herreb",
      actorId: "team",
      role: "user"
    }
  });
  assert.equal(next.identities[1]?.email, "team@herreb.test");
});

test("fails closed when identity tenant does not exist", () => {
  assert.throws(
    () =>
      planWorkforceAdminMutation(base, {
        type: "identity.upsert",
        identity: {
          email: "x@test",
          tenantId: "missing",
          actorId: "x",
          role: "user"
        }
      }),
    /TENANT_NOT_FOUND/
  );
});

test("deletes identity by normalized email", () => {
  const next = planWorkforceAdminMutation(base, {
    type: "identity.delete",
    email: " OWNER@HERREB.TEST "
  });
  assert.equal(next.identities.length, 0);
});
