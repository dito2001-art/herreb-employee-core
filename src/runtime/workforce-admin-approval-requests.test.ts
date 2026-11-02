import assert from "node:assert/strict";
import test from "node:test";
import { DurableApprovalRequests } from "./workforce-admin-approval-requests";
import { workforceMutationDigest } from "./workforce-admin-independent-approval";

const mutation = { type: "identity.delete" as const, email: "person@example.com" };
const requestId = "approval-request-1234567890";
const now = 1_800_000_000_000;
function fixture() {
  const data = new Map<string, unknown>();
  const storage = {
    async get<T>(key: string) { return data.get(key) as T | undefined; },
    async put<T>(key: string, value: T) { data.set(key, value); }
  };
  return { data, requests: new DurableApprovalRequests(storage) };
}
test("independent reviewer issues exact digest-bound grant", async () => {
  const h = fixture();
  const pending = await h.requests.request({ requestId, requesterActorId: "requester", mutation, now });
  assert.equal(pending.mutationSha256, await workforceMutationDigest(mutation));
  assert.equal(await h.requests.approve({ requestId, approverActorId: "reviewer", now: now + 1000 }), true);
  const grant = h.data.get("workforce-admin:approval:v1:" + requestId) as {
    requesterActorId: string; approverActorId: string; consumed: boolean
  };
  assert.equal(grant.requesterActorId, "requester");
  assert.equal(grant.approverActorId, "reviewer");
  assert.equal(grant.consumed, false);
  assert.equal(await h.requests.approve({ requestId, approverActorId: "reviewer", now: now + 2000 }), false);
});
test("self-approval, expiration and duplicate requests fail closed", async () => {
  const h = fixture();
  const input = { requestId, requesterActorId: "requester", mutation, now };
  await h.requests.request(input);
  await assert.rejects(() => h.requests.request(input), /CONFLICT/);
  assert.equal(await h.requests.approve({ requestId, approverActorId: "requester", now }), false);
  assert.equal(await h.requests.approve({ requestId, approverActorId: "reviewer", now: now + 300_000 }), false);
  assert.equal(h.data.has("workforce-admin:approval:v1:" + requestId), false);
});
