import assert from "node:assert/strict";
import test from "node:test";
import {
  createPersistentSalesStateRepository,
  type SalesStateStorage
} from "./sales-state-persistent";

function memoryStorage(): SalesStateStorage {
  const records = new Map<string, string>();
  return {
    async list(prefix) {
      return [...records.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, value }));
    },
    async get(key) {
      return records.get(key);
    },
    async put(key, value) {
      records.set(key, value);
    }
  };
}

test("persistent sales state survives repository recreation", async () => {
  const storage = memoryStorage();
  const first = createPersistentSalesStateRepository(storage);
  await first.put("tenant-a", {
    id: "lead-1",
    tenantId: "tenant-a",
    source: "DATABASE",
    contactKey: "595981000000",
    qualified: true,
    contacted: true,
    lastExecutionKey: "execution-1"
  });

  const second = createPersistentSalesStateRepository(storage);
  const restored = await second.get("tenant-a", "lead-1");
  assert.equal(restored?.contacted, true);
  assert.equal(restored?.lastExecutionKey, "execution-1");
});

test("persistent sales state isolates identical lead ids by tenant", async () => {
  const repository = createPersistentSalesStateRepository(memoryStorage());
  await repository.put("tenant-a", {
    id: "lead-1",
    tenantId: "tenant-a",
    source: "DATABASE",
    contactKey: "a",
    qualified: true
  });
  await repository.put("tenant-b", {
    id: "lead-1",
    tenantId: "tenant-b",
    source: "DATABASE",
    contactKey: "b",
    qualified: true
  });

  assert.equal(
    (await repository.get("tenant-a", "lead-1"))?.contactKey,
    "a"
  );
  assert.equal(
    (await repository.get("tenant-b", "lead-1"))?.contactKey,
    "b"
  );
  assert.equal((await repository.list("tenant-a")).length, 1);
});

test("persistent sales state fails closed on cross-tenant writes", async () => {
  const repository = createPersistentSalesStateRepository(memoryStorage());
  await assert.rejects(
    repository.put("tenant-a", {
      id: "lead-1",
      tenantId: "tenant-b",
      source: "DATABASE",
      contactKey: "b"
    }),
    /SALES_STATE_TENANT_MISMATCH/
  );
  assert.equal((await repository.list("tenant-a")).length, 0);
  assert.equal((await repository.list("tenant-b")).length, 0);
});

test("persistent sales state rejects poisoned tenant records", async () => {
  const storage = memoryStorage();
  await storage.put(
    "sales-state:tenant-a:lead-1",
    JSON.stringify({
      id: "lead-1",
      tenantId: "tenant-b",
      source: "DATABASE",
      contactKey: "b"
    })
  );
  const repository = createPersistentSalesStateRepository(storage);
  await assert.rejects(
    repository.get("tenant-a", "lead-1"),
    /SALES_STATE_TENANT_MISMATCH/
  );
});
