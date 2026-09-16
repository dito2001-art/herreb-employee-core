import assert from "node:assert/strict";
import test from "node:test";
import type { Offering } from "./contracts";
import type { KnowledgeRecord } from "./knowledge";
import {
  createSqliteTenantKnowledgeRepository,
  createSqliteTenantOfferingRepository,
  type SqlStorageLike
} from "./sqlite-marketing-repositories";

type StoredRow = {
  tenantId: string;
  id: string;
  namespace?: string;
  active?: number;
  payload: string;
};

class MemorySqlStorage implements SqlStorageLike {
  readonly knowledge = new Map<string, StoredRow>();
  readonly offerings = new Map<string, StoredRow>();

  exec<T = Record<string, unknown>>(
    query: string,
    ...bindings: unknown[]
  ): Iterable<T> {
    if (query.startsWith("CREATE ")) return [];

    if (query.startsWith("INSERT INTO emp003_knowledge")) {
      const [tenantId, id, namespace, payload] = bindings.map(String);
      this.knowledge.set(`${tenantId}:${id}`, {
        tenantId,
        id,
        namespace,
        payload
      });
      return [];
    }
    if (query.startsWith("INSERT INTO emp003_offerings")) {
      const tenantId = String(bindings[0]);
      const id = String(bindings[1]);
      const active = Number(bindings[2]);
      const payload = String(bindings[3]);
      this.offerings.set(`${tenantId}:${id}`, {
        tenantId,
        id,
        active,
        payload
      });
      return [];
    }

    const select = (rows: StoredRow[]) => rows.map(({ payload }) => ({ payload })) as T[];
    if (query.includes("FROM emp003_knowledge")) {
      const tenantId = String(bindings[0]);
      let rows = [...this.knowledge.values()].filter((row) => row.tenantId === tenantId);
      if (query.includes("namespace = ?")) rows = rows.filter((row) => row.namespace === String(bindings[1]));
      if (query.includes("id = ?")) rows = rows.filter((row) => row.id === String(bindings[1]));
      return select(rows.sort((a, b) => a.id.localeCompare(b.id)));
    }
    if (query.includes("FROM emp003_offerings")) {
      const tenantId = String(bindings[0]);
      let rows = [...this.offerings.values()].filter((row) => row.tenantId === tenantId);
      if (query.includes("active = 1")) rows = rows.filter((row) => row.active === 1);
      if (query.includes("id = ?")) rows = rows.filter((row) => row.id === String(bindings[1]));
      return select(rows.sort((a, b) => a.id.localeCompare(b.id)));
    }
    throw new Error(`UNSUPPORTED_SQL:${query}`);
  }
}

const knowledge = (tenantId: string, id: string): KnowledgeRecord => ({
  id,
  tenantId,
  namespace: "marketing",
  kind: "CANONICAL",
  subject: `offering:${id}`,
  content: { statement: `${tenantId}:${id}` },
  sourceRefs: ["client0-test"],
  confidence: 1,
  verified: true,
  updatedAt: "2026-09-16T00:00:00Z"
});

const offering = (tenantId: string, id: string, active = true): Offering => ({
  id,
  tenantId,
  type: "SERVICE",
  name: id,
  active,
  metadata: {}
});

test("knowledge survives repository recreation and remains tenant isolated", async () => {
  const sql = new MemorySqlStorage();
  const first = createSqliteTenantKnowledgeRepository(sql);
  await first.put("herreb-client-0", knowledge("herreb-client-0", "k-1"));
  await first.put("tenant-b", knowledge("tenant-b", "k-b"));

  const afterRestart = createSqliteTenantKnowledgeRepository(sql);
  assert.equal((await afterRestart.list("herreb-client-0")).length, 1);
  assert.equal((await afterRestart.get("herreb-client-0", "k-1"))?.id, "k-1");
  assert.equal(await afterRestart.get("herreb-client-0", "k-b"), undefined);
  assert.deepEqual(
    (await afterRestart.listVerifiedCanonical("herreb-client-0")).map((row) => row.id),
    ["k-1"]
  );
});

test("offerings survive repository recreation, filter active, and remain tenant isolated", async () => {
  const sql = new MemorySqlStorage();
  const first = createSqliteTenantOfferingRepository(sql);
  await first.put("herreb-client-0", offering("herreb-client-0", "service-active"));
  await first.put("herreb-client-0", offering("herreb-client-0", "service-paused", false));
  await first.put("tenant-b", offering("tenant-b", "foreign"));

  const afterRestart = createSqliteTenantOfferingRepository(sql);
  assert.deepEqual(
    (await afterRestart.list("herreb-client-0", true)).map((row) => row.id),
    ["service-active"]
  );
  assert.equal(await afterRestart.get("herreb-client-0", "foreign"), undefined);
});

test("sqlite repositories fail closed on cross-tenant writes", async () => {
  const sql = new MemorySqlStorage();
  const knowledgeRepository = createSqliteTenantKnowledgeRepository(sql);
  const offeringRepository = createSqliteTenantOfferingRepository(sql);

  await assert.rejects(
    knowledgeRepository.put("herreb-client-0", knowledge("tenant-b", "foreign-k")),
    /TENANT_ISOLATION/
  );
  await assert.rejects(
    offeringRepository.put("herreb-client-0", offering("tenant-b", "foreign-o")),
    /OFFERING_TENANT_ISOLATION_VIOLATION/
  );
  assert.equal(sql.knowledge.size, 0);
  assert.equal(sql.offerings.size, 0);
});
