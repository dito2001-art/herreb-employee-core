import assert from "node:assert/strict";
import test from "node:test";
import { DurableIndependentApprovalStore } from "./workforce-admin-approval-store";
import { workforceMutationDigest } from "./workforce-admin-independent-approval";

const mutation = { type: "tenant.create" as const, tenant: {
  tenantId: "client-c", name: "Client C", enabledEmployees: ["EMP-001" as const],
  knowledgeNamespace: "client-c:k", offeringNamespace: "client-c:o"
}};

test("persisted independent approval is bound to exact request and cannot be replayed", async () => {
  const entries = new Map<string, unknown>();
  const storage = {
    async get<T>(key: string): Promise<T | undefined> { return entries.get(key) as T | undefined; },
    async put<T>(key: string, value: T): Promise<void> { entries.set(key, value); }
  };
  const approvals = new DurableIndependentApprovalStore(storage);
  const now = 1_800_000_000_000;
  const requestId = "approval-request-1234567890";
  await approvals.issue({
    requestId, requesterActorId: "platform-admin", approverActorId: "separate-reviewer",
    mutationSha256: await workforceMutationDigest(mutation), expiresAt: now + 60_000
  });
  await assert.rejects(() => approvals.issue({
    requestId, requesterActorId: "platform-admin", approverActorId: "separate-reviewer",
    mutationSha256: await workforceMutationDigest(mutation), expiresAt: now + 60_000
  }), /CONFLICT/);
  assert.equal(await approvals.consume({
    requestId, requesterActorId: "different-admin", mutation, now
  }), false);
  assert.equal(await approvals.consume({
    requestId, requesterActorId: "platform-admin",
    mutation: { ...mutation, tenant: { ...mutation.tenant, tenantId: "client-a" } }, now
  }), false);
  assert.equal(await approvals.consume({
    requestId, requesterActorId: "platform-admin", mutation, now
  }), true);
  assert.equal(await approvals.consume({
    requestId, requesterActorId: "platform-admin", mutation, now
  }), false);
});

test("expired and self-approved grants are rejected without consumption", async () => {
  const entries = new Map<string, unknown>();
  const approvals = new DurableIndependentApprovalStore({
    async get<T>(key: string) { return entries.get(key) as T | undefined; },
    async put<T>(key: string, value: T) { entries.set(key, value); }
  });
  const now = 1_800_000_000_000;
  await approvals.issue({
    requestId: "approval-expired-1234567890", requesterActorId: "platform",
    approverActorId: "platform", mutationSha256: await workforceMutationDigest(mutation),
    expiresAt: now - 1
  });
  assert.equal(await approvals.consume({
    requestId: "approval-expired-1234567890", requesterActorId: "platform", mutation, now
  }), false);
});
