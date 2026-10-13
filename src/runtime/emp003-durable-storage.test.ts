import assert from "node:assert/strict";
import { test } from "node:test";
import { createEMP003DurableStorageAdapter, type EMP003DurableStorage } from "./emp003-durable-storage";
import { createPersistentBlueprintRepository } from "../core/marketing-blueprint-persistent";

function fixture() {
  const values = new Map<string, unknown>();
  const storage: EMP003DurableStorage = {
    async get<T>(key: string) { return values.get(key) as T | undefined; },
    async put<T>(key: string, value: T) { values.set(key, value); },
    async list<T>({ prefix }: { prefix: string }) {
      return new Map([...values].filter(([key]) => key.startsWith(prefix))) as Map<string, T>;
    }
  };
  return { values, adapter: createEMP003DurableStorageAdapter(storage) };
}
const blueprint = { tenantId: "herreb-client-0", correlationId: "corr-1", objective: "Grow leads", audiences: ["B2B"], positioning: "Helpful", keyMessages: ["Fast"], channels: [{ name: "Email", actions: ["Draft"] }], kpis: [{ metric: "Leads", target: "TBD", measurement: "CRM" }], assumptions: [], evidenceRefs: ["https://developers.cloudflare.com/"], status: "DRAFT" as const, publishApproved: false as const };
test("durable adapter roundtrip supports blueprint repository", async () => {
  const { adapter } = fixture();
  const repo = createPersistentBlueprintRepository(adapter);
  await repo.put("herreb-client-0", "campaign-1", blueprint);
  assert.deepEqual(await repo.get("herreb-client-0", "campaign-1"), blueprint);
  assert.deepEqual(await repo.list("herreb-client-0"), [blueprint]);
  assert.equal(await repo.get("other-tenant", "campaign-1"), undefined);
});
test("durable adapter rejects non-string stored values", async () => {
  const { values, adapter } = fixture();
  values.set("emp003:blueprint:tenant:a", { invalid: true });
  await assert.rejects(adapter.get("emp003:blueprint:tenant:a"), /EMP003_STORAGE_VALUE_INVALID/);
  await assert.rejects(adapter.list("emp003:blueprint:tenant:"), /EMP003_STORAGE_VALUE_INVALID/);
});
test("durable adapter rejects list entries outside requested prefix", async () => {
  const storage: EMP003DurableStorage = {
    async get<T>() { return undefined as T | undefined; },
    async put<T>(_key: string, _value: T) {},
    async list<T>() { return new Map([["unrelated:key", "value"]]) as Map<string, T>; }
  };
  await assert.rejects(createEMP003DurableStorageAdapter(storage).list("emp003:"), /EMP003_STORAGE_VALUE_INVALID/);
});
