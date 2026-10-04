import assert from "node:assert/strict";
import test from "node:test";
import { bootstrapWorkforceAdminState, DurableWorkforceAdminAuditSink, DurableWorkforceAdminStore } from "./workforce-admin-store";

function memoryStorage() {
  const data = new Map<string, unknown>();
  return {
    async get<T>(key: string) { return data.get(key) as T | undefined; },
    async put<T>(key: string, value: T) { data.set(key, value); },
    data
  };
}

test("bootstraps admin state from current JSON configuration", () => {
  const state = bootstrapWorkforceAdminState({
    tenantManifestsJson: '[{"tenantId":"herreb-client-0","name":"HerreB Client 0","enabledEmployees":["EMP-002"],"knowledgeNamespace":"k","offeringNamespace":"o"}]',
    accessIdentityMapJson: '[{"email":"owner@herreb.test","tenantId":"herreb-client-0","actorId":"owner","role":"owner"}]'
  });
  assert.equal(state.manifests[0]?.tenantId, "herreb-client-0");
  assert.equal(state.identities[0]?.role, "owner");
});

test("uses bootstrap until first durable write then reads persisted state", async () => {
  const storage = memoryStorage();
  const bootstrap = { manifests: [], identities: [] };
  const store = new DurableWorkforceAdminStore(storage, bootstrap);
  assert.deepEqual(await store.read(), bootstrap);
  const next = { manifests: [{ tenantId: "pilot", name: "Pilot", enabledEmployees: ["EMP-002" as const], knowledgeNamespace: "k", offeringNamespace: "o" }], identities: [] };
  await store.write(next);
  assert.deepEqual(await store.read(), next);
});

test("audit sink persists immutable evidence under audit namespace", async () => {
  const storage = memoryStorage();
  const audit = new DurableWorkforceAdminAuditSink(storage);
  await audit.append({ auditId: "audit-1", actorId: "owner", tenantId: "herreb-client-0", mutationType: "tenant.employees.set", decision: "GREEN", persisted: true, timestamp: "2026-10-04T01:00:00.000Z" });
  assert.equal(storage.data.size, 1);
  assert.equal((Array.from(storage.data.values())[0] as { auditId: string }).auditId, "audit-1");
});
