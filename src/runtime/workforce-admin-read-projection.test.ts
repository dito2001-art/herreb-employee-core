import { strict as assert } from "node:assert";
import { test } from "node:test";
import { projectAuthorizedWorkforceAdminRead } from "./workforce-admin-read-projection";
import type { WorkforceAdminMutationPlan } from "../core/workforce-admin-mutations";
const state: WorkforceAdminMutationPlan = {
 manifests: [
  { tenantId: "alpha", name: "Alpha", enabledEmployees: ["EMP-001"], knowledgeNamespace: "alpha-k", offeringNamespace: "alpha-o" },
  { tenantId: "beta", name: "Beta", enabledEmployees: ["EMP-002"], knowledgeNamespace: "beta-k", offeringNamespace: "beta-o" }
 ],
 identities: [
  { tenantId: "alpha", actorId: "owner-a", email: "a@example.com", role: "owner" },
  { tenantId: "beta", actorId: "owner-b", email: "b@example.com", role: "owner" }
 ]
};
test("UI response is scoped and totals do not leak other tenants", () => {
 const result = projectAuthorizedWorkforceAdminRead(state, { actorId: "owner-a", tenantId: "alpha", role: "owner" });
 assert.deepEqual(result.tenants.map(t => t.tenantId), ["alpha"]);
 assert.deepEqual(result.totals, { tenants: 1, identities: 1, enabledEmployees: 1 });
 assert.equal(JSON.stringify(result).includes("beta"), false);
});
test("platform admin can view all tenants", () => {
 assert.equal(projectAuthorizedWorkforceAdminRead(state, { actorId: "root", tenantId: "platform", role: "platform_admin" }).totals.tenants, 2);
});
test("unauthenticated and non-owner roles fail closed", () => {
 assert.throws(() => projectAuthorizedWorkforceAdminRead(state, undefined));
 assert.throws(() => projectAuthorizedWorkforceAdminRead(state, { actorId: "a", tenantId: "alpha", role: "user" }));
 assert.throws(() => projectAuthorizedWorkforceAdminRead(state, { actorId: "a", tenantId: "alpha", role: "platform_admin" }));
});
