import { strict as assert } from "node:assert";
import { test } from "node:test";
import { scopeWorkforceAdminSnapshot } from "./workforce-admin-scoped-read";
import type { WorkforceAdminSnapshot } from "../core/workforce-admin";

const snapshot: WorkforceAdminSnapshot = {
  tenants: [
    { tenantId: "a", enabledEmployees: ["EMP-001"], knowledgeNamespace: "a-k", offeringNamespace: "a-o", identities: [{ email: "a@example.com", actorId: "a1", tenantId: "a", role: "owner" }] },
    { tenantId: "b", enabledEmployees: ["EMP-002", "EMP-003"], knowledgeNamespace: "b-k", offeringNamespace: "b-o", identities: [{ email: "b@example.com", actorId: "b1", tenantId: "b", role: "owner" }] }
  ],
  totals: { tenants: 2, identities: 2, enabledEmployees: 3 }
};
test("tenant owner sees only own tenant and scoped totals", () => {
  const result = scopeWorkforceAdminSnapshot(snapshot, { actorId: "a1", tenantId: "a", role: "owner" });
  assert.deepEqual(result.tenants.map(t => t.tenantId), ["a"]);
  assert.deepEqual(result.totals, { tenants: 1, identities: 1, enabledEmployees: 1 });
});
test("platform admin sees global snapshot", () => {
  assert.equal(scopeWorkforceAdminSnapshot(snapshot, { actorId: "root", tenantId: "platform", role: "platform_admin" }), snapshot);
});
test("missing identity, tenant mismatch, user and forged platform role fail closed", () => {
  assert.throws(() => scopeWorkforceAdminSnapshot(snapshot, undefined));
  assert.throws(() => scopeWorkforceAdminSnapshot(snapshot, { actorId: "a1", tenantId: "b", role: "user" }));
  assert.throws(() => scopeWorkforceAdminSnapshot(snapshot, { actorId: "root", tenantId: "a", role: "platform_admin" }));
  assert.throws(() => scopeWorkforceAdminSnapshot(snapshot, { actorId: "a1", tenantId: "missing", role: "owner" }));
});
