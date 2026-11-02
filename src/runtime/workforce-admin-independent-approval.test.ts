import assert from "node:assert/strict";
import test from "node:test";
import { validateIndependentApproval, workforceMutationDigest } from "./workforce-admin-independent-approval";

const mutation = { type: "tenant.create" as const, tenant: {
  tenantId: "client-c", name: "Client C", enabledEmployees: ["EMP-001" as const],
  knowledgeNamespace: "client-c:k", offeringNamespace: "client-c:o"
}};
const now = 1_800_000_000_000;

test("approval requires a distinct approver and an exact tenant creation digest", async () => {
  const grant = {
    requestId: "request-1234567890", requesterActorId: "requester",
    approverActorId: "independent-reviewer",
    mutationSha256: await workforceMutationDigest(mutation), expiresAt: now + 60_000
  };
  const verify = (overrides: Partial<typeof grant> = {}, candidate = mutation, actor = "requester", at = now) =>
    validateIndependentApproval({ grant: { ...grant, ...overrides }, mutation: candidate, requesterActorId: actor, now: at });
  assert.equal(await verify(), true);
  assert.equal(await verify({ approverActorId: "requester" }), false);
  assert.equal(await verify({ requesterActorId: "other" }), false);
  assert.equal(await verify({}, mutation, "other"), false);
  assert.equal(await verify({ requestId: "short" }), false);
  assert.equal(await verify({ expiresAt: now }), false);
  assert.equal(await verify({ expiresAt: now + 300_001 }), false);
  assert.equal(await verify({}, { ...mutation, tenant: { ...mutation.tenant, tenantId: "client-a" } }), false);
  assert.equal(await verify({ mutationSha256: "0".repeat(64) }), false);
});

test("digest is independent of object key insertion order", async () => {
  const reordered = { tenant: { name: "Client C", offeringNamespace: "client-c:o",
    knowledgeNamespace: "client-c:k", enabledEmployees: ["EMP-001" as const], tenantId: "client-c" },
    type: "tenant.create" as const };
  assert.equal(await workforceMutationDigest(mutation), await workforceMutationDigest(reordered));
});
