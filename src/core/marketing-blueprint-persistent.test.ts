import assert from "node:assert/strict";
import { test } from "node:test";
import { createPersistentBlueprintRepository } from "./marketing-blueprint-persistent";
import type { CampaignStorage } from "./campaign-persistent";

const blueprint = { tenantId: "herreb-client-0", correlationId: "corr-1", objective: "Grow leads", audiences: ["B2B"], positioning: "Helpful", keyMessages: ["Fast"], channels: [{ name: "Email", actions: ["Draft"] }], kpis: [{ metric: "Leads", target: "TBD", measurement: "CRM" }], assumptions: [], evidenceRefs: ["https://developers.cloudflare.com/"], status: "DRAFT" as const, publishApproved: false as const };
function fixture() {
  const map = new Map<string, string>();
  const storage: CampaignStorage = {
    async get(key) { return map.get(key); },
    async put(key, value) { map.set(key, value); },
    async list(prefix) { return [...map].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value })); }
  };
  return { map, repo: createPersistentBlueprintRepository(storage) };
}
test("persist, read back and list draft", async () => {
  const { repo } = fixture();
  await repo.put("herreb-client-0", "cmp-1", blueprint);
  assert.deepEqual(await repo.get("herreb-client-0", "cmp-1"), blueprint);
  assert.deepEqual(await repo.list("herreb-client-0"), [blueprint]);
});
test("tenant cannot see another tenant's campaign", async () => {
  const { repo } = fixture();
  await repo.put("herreb-client-0", "cmp-1", blueprint);
  assert.equal(await repo.get("other-tenant", "cmp-1"), undefined);
  assert.deepEqual(await repo.list("other-tenant"), []);
});
test("rejects cross-tenant write", async () => {
  const { repo } = fixture();
  await assert.rejects(repo.put("other-tenant", "cmp-1", blueprint), /EMP003_STORAGE_TENANT_VIOLATION/);
});
test("rejects unsafe identifiers", async () => {
  const { repo } = fixture();
  await assert.rejects(repo.put("herreb-client-0", "../cmp", blueprint), /EMP003_STORAGE_ID_INVALID/);
  await assert.rejects(repo.get("../tenant", "cmp-1"), /EMP003_STORAGE_ID_INVALID/);
});
test("rejects approved or published blueprint payload", async () => {
  const { repo } = fixture();
  await assert.rejects(repo.put("herreb-client-0", "cmp-1", { ...blueprint, publishApproved: true } as never));
});
test("rejects tampered persisted tenant on read", async () => {
  const { repo, map } = fixture();
  map.set("emp003:blueprint:herreb-client-0:cmp-1", JSON.stringify({ ...blueprint, tenantId: "other-tenant" }));
  await assert.rejects(repo.get("herreb-client-0", "cmp-1"), /EMP003_STORAGE_TENANT_VIOLATION/);
});
