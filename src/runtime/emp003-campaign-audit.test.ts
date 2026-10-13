import assert from "node:assert/strict";
import { test } from "node:test";
import { createEMP003AuditRepository } from "./emp003-campaign-audit";

const base = { tenantId: "herreb-client-0", campaignId: "cmp-1", correlationId: "corr-1",
  actorId: "fernando", actorRole: "owner", from: "DRAFT", to: "IN_REVIEW",
  reason: "Ready for review", idempotencyKey: "idem-1" } as const;

function fixture() {
  const values = new Map<string, unknown>();
  return createEMP003AuditRepository({
    async get(key) { return values.get(key); },
    async put(key, value) { values.set(key, value); },
    async list({ prefix }) { return new Map([...values].filter(([key]) => key.startsWith(prefix))); }
  });
}
test("append and read-back returns durable tenant-scoped audit event", async () => {
  const audit = fixture();
  const saved = await audit.append(base, base.tenantId, "2026-10-13T17:00:00Z");
  assert.equal(saved.publishExecuted, false);
  assert.deepEqual(await audit.list(base.tenantId, base.campaignId), [saved]);
  assert.deepEqual(await audit.list("another-tenant", base.campaignId), []);
});
test("same idempotency key cannot overwrite distinct event", async () => {
  const audit = fixture();
  const saved = await audit.append(base, base.tenantId, "2026-10-13T17:00:00Z");
  assert.deepEqual(await audit.append(base, base.tenantId, "2026-10-13T17:00:00Z"), saved);
  await assert.rejects(audit.append({ ...base, reason: "Changed" }, base.tenantId, "2026-10-13T17:00:00Z"), /EMP003_AUDIT_IDEMPOTENCY_CONFLICT/);
});
test("cross-tenant append and illegal transitions denied", async () => {
  const audit = fixture();
  await assert.rejects(audit.append(base, "another-tenant", "2026-10-13T17:00:00Z"), /EMP003_TENANT_SCOPE_REJECTED/);
  await assert.rejects(audit.append({ ...base, to: "APPROVED" }, base.tenantId, "2026-10-13T17:00:00Z"), /EMP003_CAMPAIGN_TRANSITION_DENIED/);
});
