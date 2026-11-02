import assert from "node:assert/strict";
import test from "node:test";
import { commitApprovedAdminMutation } from "./workforce-admin-approved-transaction";
import { workforceMutationDigest } from "./workforce-admin-independent-approval";
import type { WorkforceAdminMutationPlan } from "../core/workforce-admin-mutations";

const mutation = { type: "tenant.create" as const, tenant: {
  tenantId: "client-c", name: "Client C", enabledEmployees: ["EMP-001" as const],
  knowledgeNamespace: "client-c:k", offeringNamespace: "client-c:o"
}};
const bootstrap: WorkforceAdminMutationPlan = { manifests: [], identities: [] };
const now = 1_800_000_000_000;
const requestId = "approval-client-c-1234567890";
const approvalKey = "workforce-admin:approval:v1:" + requestId;
const stateKey = "workforce-admin:state:v1";

function fixture(failWrite = false) {
  const data = new Map<string, unknown>();
  return {
    data,
    storage: {
      async transaction<T>(callback: (tx: {
        get<V>(key: string): Promise<V | undefined>;
        put<V>(key: string, value: V): Promise<void>;
      }) => Promise<T>): Promise<T> {
        const pending = new Map(data);
        const result = await callback({
          async get<V>(key: string) { return pending.get(key) as V | undefined; },
          async put<V>(key: string, value: V) {
            if (failWrite && key === approvalKey) throw new Error("INJECTED_STORAGE_FAILURE");
            pending.set(key, value);
          }
        });
        data.clear();
        for (const [key, value] of pending) data.set(key, value);
        return result;
      }
    }
  };
}

test("atomic approval commits tenant C once and rejects replay", async () => {
  const h = fixture();
  h.data.set(approvalKey, {
    requestId, requesterActorId: "requester", approverActorId: "reviewer",
    mutationSha256: await workforceMutationDigest(mutation), expiresAt: now + 60_000,
    consumed: false
  });
  const input = { storage: h.storage, bootstrap, mutation, requesterActorId: "requester", requestId, now, auditId: "audit-transaction-1", requesterTenantId: "platform" };
  assert.equal(await commitApprovedAdminMutation(input), true);
  assert.equal((h.data.get(stateKey) as WorkforceAdminMutationPlan).manifests[0]?.tenantId, "client-c");
  assert.equal(await commitApprovedAdminMutation(input), false);
  const audit = h.data.get("workforce-admin:audit:v1:" + new Date(now).toISOString() + ":audit-transaction-1") as { persisted: boolean; approverActorId: string };
  assert.equal(audit.persisted, true);
  assert.equal(audit.approverActorId, "reviewer");
});

test("failed approval consumption rolls back registry write", async () => {
  const h = fixture(true);
  h.data.set(approvalKey, {
    requestId, requesterActorId: "requester", approverActorId: "reviewer",
    mutationSha256: await workforceMutationDigest(mutation), expiresAt: now + 60_000,
    consumed: false
  });
  await assert.rejects(() => commitApprovedAdminMutation({
    storage: h.storage, bootstrap, mutation, requesterActorId: "requester", requestId, now, auditId: "rollback-audit", requesterTenantId: "platform"
  }), /INJECTED_STORAGE_FAILURE/);
  assert.equal([...h.data.keys()].some((key) => key.endsWith(":rollback-audit")), false);
  assert.equal(h.data.has(stateKey), false);
  assert.equal((h.data.get(approvalKey) as { consumed: boolean }).consumed, false);
});

test("wrong actor cannot consume an approval", async () => {
  const h = fixture();
  h.data.set(approvalKey, {
    requestId, requesterActorId: "requester", approverActorId: "reviewer",
    mutationSha256: await workforceMutationDigest(mutation), expiresAt: now + 60_000,
    consumed: false
  });
  assert.equal(await commitApprovedAdminMutation({
    storage: h.storage, bootstrap, mutation, requesterActorId: "another", requestId, now, auditId: "wrong-actor-audit", requesterTenantId: "platform"
  }), false);
  assert.equal(h.data.has(stateKey), false);
});
